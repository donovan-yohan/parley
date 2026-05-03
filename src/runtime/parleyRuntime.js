import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildScenarioCharacter, persistCharacterMarkdown } from "./belayerCharacterAdapter.js";
import {
  validateActionInterpretation,
  validateBeatRedirect,
  validateDetourScene,
  validateStoryConsequence
} from "./dm/detourContracts.js";
import { defaultScenarioId, loadScenarioPack, scenarioMetadata } from "./scenarioPacks.js";
import { judgeTurn } from "./truthAuthority.js";
import { createScenarioFixtureAuthor, normalizeAuthoredTurn } from "./turnAuthor.js";
import { attachVisualAssetsToCharacters, loadVisualAssetManifest, prepareVisualAssetsForScenario } from "./visualAssets.js";

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(runtimeDir, "..", "..");
const defaultWorldDir = path.join(repoRoot, "worlds", "last-lantern");
const defaultScenePath = path.join(repoRoot, "examples", "last-lantern", "scene.yaml");

export async function runPlayerTurn({
  scenarioId = defaultScenarioId,
  playerAction,
  stateDir,
  scenePath = defaultScenePath,
  worldDir,
  turnAuthor = createScenarioFixtureAuthor(),
  truthAuthority = judgeTurn
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

  const worldStatePath = path.join(resolvedStateDir, "world-state.json");
  const previousWorldState = await readJsonIfExists(worldStatePath);
  const turnId = await nextTurnId(resolvedStateDir);
  let characters = scenario.characters.map((characterDefinition) =>
    buildScenarioCharacter({ scenario, characterDefinition, sourceRequest: turnId, scene })
  );
  const visualAssets = await prepareVisualAssetsForScenario({
    scenario,
    scene,
    characters,
    worldDir: resolvedWorldDir
  });
  characters = attachVisualAssetsToCharacters({ characters, visualAssets });
  await Promise.all(characters.map((character) => persistCharacterMarkdown({ character, worldDir: resolvedWorldDir })));

  const authoredTurn = await buildAuthoredTurn({
    turnAuthor,
    turnId,
    scenario,
    scene,
    playerAction: trimmedAction,
    characters,
    previousWorldState
  });
  const { narration, nextChoices, proposedFacts, authoring } = authoredTurn;
  const truthVerdict = await truthAuthority({
    turnId,
    scene,
    scenario,
    playerAction: trimmedAction,
    narration,
    characters,
    proposedFacts,
    handledRejectedClaims: authoredTurn.handledRejectedClaims,
    actionInterpretation: authoredTurn.actionInterpretation,
    detourScene: authoredTurn.detourScene,
    storyConsequence: authoredTurn.storyConsequence,
    beatRedirect: authoredTurn.beatRedirect
  });

  validateTruthVerdict(truthVerdict);

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
      authoring,
      visualAssets,
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
    visual_assets: visualAssets.assets.map((asset) => asset.id),
    authoring,
    dm_artifacts: summarizeDmArtifacts(authoredTurn),
    truth_verdict: truthVerdict.id
  };

  await appendJsonLine(path.join(resolvedStateDir, "turns.jsonl"), turn);
  await persistDmArtifacts({ stateDir: resolvedStateDir, authoredTurn });
  await appendJsonLine(path.join(resolvedStateDir, "truth-verdicts.jsonl"), truthVerdict);
  const worldState = buildWorldState({ scenario, scene, turn, characters, truthVerdict, visualAssets, previousWorldState, authoredTurn });
  await writeFile(worldStatePath, `${JSON.stringify(worldState, null, 2)}\n`, "utf8");

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
    visualAssets,
    authoring,
    committed: true
  };
}

export async function loadCurrentState({
  scenarioId = defaultScenarioId,
  stateDir,
  scenePath = defaultScenePath,
  worldDir
} = {}) {
  const scenario = await loadRuntimeScenario({ scenarioId, scenePath });
  const resolvedStateDir = stateDir ?? scenario.stateDir;
  const resolvedWorldDir = worldDir ?? scenario.worldDir;
  const worldState = await readJsonIfExists(path.join(resolvedStateDir, "world-state.json"));
  const turns = await readJsonLinesIfExists(path.join(resolvedStateDir, "turns.jsonl"));
  const latestVisualAssets = await loadVisualAssetManifest(resolvedWorldDir);
  const visualAssets = latestVisualAssets.assets.length ? latestVisualAssets : worldState?.visual_assets ?? latestVisualAssets;
  const characters = attachVisualAssetsToCharacters({ characters: worldState?.characters ?? [], visualAssets });
  return {
    scenario: scenarioMetadata(scenario),
    scene: scenario.scene,
    openingNarration: scenario.openingNarration,
    defaultPlayerAction: scenario.defaultPlayerAction,
    worldState,
    visualAssets,
    transcript: turns,
    characters,
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

async function buildAuthoredTurn({ turnAuthor, turnId, scenario, scene, playerAction, characters, previousWorldState }) {
  const resolvedTurnAuthor = typeof turnAuthor === "function"
    ? { id: "custom-turn-author", mode: "custom", authorTurn: turnAuthor }
    : turnAuthor;

  if (!resolvedTurnAuthor?.authorTurn) {
    throw new Error("turnAuthor must provide authorTurn(context)");
  }

  const authoredTurn = await resolvedTurnAuthor.authorTurn({
    turnId,
    scenario,
    scene,
    playerAction,
    characters,
    previousWorldState
  });

  validateDmArtifacts({ authoredTurn, turnId });

  return normalizeAuthoredTurn({ authoredTurn, turnAuthor: resolvedTurnAuthor, scenario, turnId });
}

function validateDmArtifacts({ authoredTurn, turnId }) {
  const artifactValidators = [
    ["actionInterpretation", validateActionInterpretation],
    ["detourScene", validateDetourScene],
    ["storyConsequence", validateStoryConsequence],
    ["beatRedirect", validateBeatRedirect]
  ];

  for (const [key, validator] of artifactValidators) {
    if (!authoredTurn[key]) {
      continue;
    }
    const artifact = validator(authoredTurn[key]);
    if (artifact.source_turn_id && artifact.source_turn_id !== turnId) {
      throw new Error(`${key} source_turn_id must match ${turnId}`);
    }
    if (artifact.turn_id && artifact.turn_id !== turnId) {
      throw new Error(`${key} turn_id must match ${turnId}`);
    }
  }
}

function validateTruthVerdict(truthVerdict) {
  if (!truthVerdict || typeof truthVerdict !== "object") {
    throw new Error("truthAuthority must return a truth verdict object");
  }

  if (!["pass", "revise"].includes(truthVerdict.verdict)) {
    throw new Error(`truthAuthority returned invalid verdict ${truthVerdict.verdict}`);
  }

  for (const key of [
    "accepted_facts",
    "rejected_claims",
    "rumors",
    "leads",
    "character_beliefs",
    "unresolved"
  ]) {
    if (!Array.isArray(truthVerdict[key])) {
      throw new Error(`truthAuthority verdict missing array ${key}`);
    }
  }
}

function buildWorldState({ scenario, scene, turn, characters, truthVerdict, visualAssets, previousWorldState, authoredTurn }) {
  const previousCharacters = previousWorldState?.characters ?? [];
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
    characters: mergeById(previousCharacters, characters.map((character) => ({
        id: character.id,
        name: character.name,
        reusable: character.reusable,
        lifecycle: character.lifecycle,
        tags: character.tags,
        belayer_generated_talent: character.belayerGeneratedTalent,
        visual: character.visual,
        portrait: character.portrait
      }))),
    canon: mergeById(previousWorldState?.canon, truthVerdict.accepted_facts),
    rumors: mergeById(previousWorldState?.rumors, truthVerdict.rumors),
    leads: mergeById(previousWorldState?.leads, truthVerdict.leads),
    character_beliefs: mergeById(previousWorldState?.character_beliefs, truthVerdict.character_beliefs),
    unresolved: mergeById(previousWorldState?.unresolved, truthVerdict.unresolved),
    rejected_claims: mergeById(previousWorldState?.rejected_claims, truthVerdict.rejected_claims ?? []),
    action_interpretations: mergeById(previousWorldState?.action_interpretations, compactArray([authoredTurn.actionInterpretation])),
    detour_scenes: mergeById(previousWorldState?.detour_scenes, compactArray([authoredTurn.detourScene])),
    story_consequences: mergeById(previousWorldState?.story_consequences, compactArray([authoredTurn.storyConsequence])),
    beat_redirects: mergeById(previousWorldState?.beat_redirects, compactArray([authoredTurn.beatRedirect])),
    visual_assets: visualAssets,
    latest_turn: turn.id,
    updated_by_truth_verdict: truthVerdict.id
  };
}

function summarizeDmArtifacts(authoredTurn) {
  return {
    action_interpretation: authoredTurn.actionInterpretation?.id ?? null,
    detour_scene: authoredTurn.detourScene?.id ?? null,
    story_consequence: authoredTurn.storyConsequence?.id ?? null,
    beat_redirect: authoredTurn.beatRedirect?.id ?? null
  };
}

async function persistDmArtifacts({ stateDir, authoredTurn }) {
  const artifactFiles = [
    ["action-interpretations.jsonl", authoredTurn.actionInterpretation],
    ["detour-scenes.jsonl", authoredTurn.detourScene],
    ["story-consequences.jsonl", authoredTurn.storyConsequence],
    ["beat-redirects.jsonl", authoredTurn.beatRedirect]
  ];

  for (const [fileName, artifact] of artifactFiles) {
    if (artifact) {
      await appendJsonLine(path.join(stateDir, fileName), artifact);
    }
  }
}

function compactArray(values) {
  return values.filter(Boolean);
}

function mergeById(previous = [], next = []) {
  const merged = new Map();
  for (const item of [...previous, ...next]) {
    if (!item) {
      continue;
    }
    const key = memoryMergeKey(item);
    merged.set(key, item);
  }
  return [...merged.values()];
}

function memoryMergeKey(item) {
  if (item.name && item.id) {
    return `id:${item.id}`;
  }
  const semanticKey = item.text ?? item.claim ?? item.summary;
  if (semanticKey) {
    return `text:${normalizeMemoryKey(semanticKey)}`;
  }
  if (item.id) {
    return `id:${item.id}`;
  }
  if (item.name) {
    return `name:${normalizeMemoryKey(item.name)}`;
  }
  return `json:${JSON.stringify(item)}`;
}

function normalizeMemoryKey(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
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
