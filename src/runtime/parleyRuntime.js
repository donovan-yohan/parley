import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildScenarioCharacter, persistCharacterMarkdown } from "./belayerCharacterAdapter.js";
import { defaultScenarioId, loadScenarioPack, scenarioMetadata } from "./scenarioPacks.js";
import { judgeTurn } from "./truthAuthority.js";

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(runtimeDir, "..", "..");
const defaultWorldDir = path.join(repoRoot, "worlds", "last-lantern");
const defaultScenePath = path.join(repoRoot, "examples", "last-lantern", "scene.yaml");

export async function runPlayerTurn({
  scenarioId = defaultScenarioId,
  playerAction,
  stateDir,
  scenePath = defaultScenePath,
  worldDir
}) {
  const trimmedAction = String(playerAction ?? "").trim();
  if (!trimmedAction) {
    throw new Error("playerAction is required");
  }

  const scenario = await loadRuntimeScenario({ scenarioId, scenePath });
  const scene = scenario.scene;
  const resolvedStateDir = stateDir ?? scenario.stateDir;
  const resolvedWorldDir = worldDir ?? scenario.worldDir;
  await mkdir(resolvedStateDir, { recursive: true });

  const turnId = await nextTurnId(resolvedStateDir);
  const characters = scenario.characters.map((characterDefinition) =>
    buildScenarioCharacter({ scenario, characterDefinition, sourceRequest: turnId, scene })
  );
  await Promise.all(characters.map((character) => persistCharacterMarkdown({ character, worldDir: resolvedWorldDir })));

  const response = selectScenarioResponse({ scenario, playerAction: trimmedAction });
  const narration = response.narration;
  const nextChoices = response.nextChoices ?? scenario.suggestedPlayerIntents;
  const proposedFacts = buildProposedFacts({ turnId, responseId: response.id, facts: scenario.proposedFacts });
  const truthVerdict = judgeTurn({
    turnId,
    scene,
    scenario,
    playerAction: trimmedAction,
    narration,
    characters,
    proposedFacts
  });

  if (truthVerdict.verdict !== "pass") {
    await appendJsonLine(path.join(resolvedStateDir, "truth-verdicts.jsonl"), truthVerdict);
    return {
      schema_version: "parley-turn/v1",
      turnId,
      scenario: scenarioMetadata(scenario),
      scene,
      playerAction: trimmedAction,
      narration,
      nextChoices: [],
      characters,
      truthVerdict,
      committed: false
    };
  }

  const turn = {
    schema_version: "parley-turn/v1",
    id: turnId,
    scenario_id: scenario.id,
    scene_id: scene.id,
    player_action: trimmedAction,
    narration,
    next_choices: nextChoices,
    characters: characters.map((character) => character.id),
    truth_verdict: truthVerdict.id
  };

  await appendJsonLine(path.join(resolvedStateDir, "turns.jsonl"), turn);
  await appendJsonLine(path.join(resolvedStateDir, "truth-verdicts.jsonl"), truthVerdict);
  const worldState = buildWorldState({ scenario, scene, turn, characters, truthVerdict });
  await writeFile(path.join(resolvedStateDir, "world-state.json"), `${JSON.stringify(worldState, null, 2)}\n`, "utf8");

  return {
    schema_version: "parley-turn/v1",
    turnId,
    scenario: scenarioMetadata(scenario),
    scene,
    playerAction: trimmedAction,
    narration,
    nextChoices,
    characters,
    truthVerdict,
    worldState,
    committed: true
  };
}

export async function loadCurrentState({
  scenarioId = defaultScenarioId,
  stateDir,
  scenePath = defaultScenePath
} = {}) {
  const scenario = await loadRuntimeScenario({ scenarioId, scenePath });
  const resolvedStateDir = stateDir ?? scenario.stateDir;
  const worldState = await readJsonIfExists(path.join(resolvedStateDir, "world-state.json"));
  const turns = await readJsonLinesIfExists(path.join(resolvedStateDir, "turns.jsonl"));
  return {
    scenario: scenarioMetadata(scenario),
    scene: scenario.scene,
    openingNarration: scenario.openingNarration,
    defaultPlayerAction: scenario.defaultPlayerAction,
    worldState,
    transcript: turns,
    characters: worldState?.characters ?? [],
    nextChoices: turns.at(-1)?.next_choices ?? scenario.suggestedPlayerIntents
  };
}

async function loadRuntimeScenario({ scenarioId, scenePath }) {
  const scenario = await loadScenarioPack(scenarioId);
  if (scenePath && scenePath !== defaultScenePath) {
    return {
      ...scenario,
      scene: await loadSceneSeed(scenePath)
    };
  }
  return scenario;
}

async function loadSceneSeed(scenePath) {
  const raw = await readFile(scenePath, "utf8");
  return {
    schema_version: matchYamlScalar(raw, "schema_version") ?? "parley-scene/v1",
    id: matchYamlScalar(raw, "id") ?? "last-lantern-tavern",
    title: matchYamlScalar(raw, "title") ?? "Last Lantern Tavern",
    crag: matchYamlScalar(raw, "crag") ?? "last-lantern",
    climb: matchYamlScalar(raw, "climb") ?? "first-rumor"
  };
}

function matchYamlScalar(raw, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw.match(new RegExp(`^${escaped}:\\s*(.*)$`, "m"));
  if (!match) {
    return undefined;
  }
  return unquoteYamlScalar(stripYamlComment(match[1]).trim());
}

function stripYamlComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) {
        if (quote === "'" && value[index + 1] === "'") {
          index += 1;
          continue;
        }
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index);
    }
  }
  return value;
}

function unquoteYamlScalar(value) {
  if (value.length < 2) {
    return value;
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }

  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  return value;
}

async function nextTurnId(stateDir) {
  const turns = await readJsonLinesIfExists(path.join(stateDir, "turns.jsonl"));
  return `turn-${String(turns.length + 1).padStart(4, "0")}`;
}

function selectScenarioResponse({ scenario, playerAction }) {
  const normalizedAction = playerAction.toLowerCase();
  return scenario.responses.find((response) =>
    (response.matchAny ?? []).some((phrase) => normalizedAction.includes(String(phrase).toLowerCase()))
  ) ?? scenario.responses.find((response) => response.id === "fallback") ?? scenario.responses[0];
}

function buildProposedFacts({ turnId, responseId, facts }) {
  return facts
    .filter((fact) => {
      const responseIds = fact.responseIds ?? ["*"];
      return responseIds.includes("*") || responseIds.includes(responseId);
    })
    .map(({ responseIds, ...fact }) => ({
      ...fact,
      evidence_turn: turnId
    }));
}

function buildWorldState({ scenario, scene, turn, characters, truthVerdict }) {
  return {
    schema_version: "parley-world-state/v1",
    scenario_id: scenario.id,
    world: scenario.world,
    current_scene: {
      id: scene.id,
      title: scene.title,
      crag: scene.crag,
      climb: scene.climb
    },
    characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        reusable: character.reusable,
        lifecycle: character.lifecycle,
        tags: character.tags,
        belayer_generated_talent: character.belayerGeneratedTalent,
        portrait: character.portrait
      })),
    canon: truthVerdict.accepted_facts,
    rumors: truthVerdict.rumors,
    leads: truthVerdict.leads,
    character_beliefs: truthVerdict.character_beliefs,
    unresolved: truthVerdict.unresolved,
    latest_turn: turn.id,
    updated_by_truth_verdict: truthVerdict.id
  };
}

async function appendJsonLine(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readJsonLinesIfExists(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
