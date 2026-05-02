import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMaraUnderbough, persistCharacterMarkdown } from "./belayerCharacterAdapter.js";
import { judgeTurn } from "./truthAuthority.js";

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(runtimeDir, "..", "..");
const defaultWorldDir = path.join(repoRoot, "worlds", "last-lantern");
const defaultScenePath = path.join(repoRoot, "examples", "last-lantern", "scene.yaml");

export async function runPlayerTurn({
  playerAction,
  stateDir = path.join(defaultWorldDir, "state"),
  scenePath = defaultScenePath,
  worldDir = defaultWorldDir
}) {
  const trimmedAction = String(playerAction ?? "").trim();
  if (!trimmedAction) {
    throw new Error("playerAction is required");
  }

  const scene = await loadSceneSeed(scenePath);
  await mkdir(stateDir, { recursive: true });

  const turnId = await nextTurnId(stateDir);
  const character = buildMaraUnderbough({ scene, sourceRequest: turnId });
  await persistCharacterMarkdown({ character, worldDir });

  const narration = narrateLastLanternTurn({ playerAction: trimmedAction, character });
  const nextChoices = [
    "Ask Mara what the Ashford name means.",
    "Ask what debt the old north road remembers.",
    "Watch the room for who reacts to Mara's warning."
  ];
  const proposedFacts = buildProposedFacts({ turnId, character });
  const truthVerdict = judgeTurn({
    turnId,
    scene,
    playerAction: trimmedAction,
    narration,
    character,
    proposedFacts
  });

  if (truthVerdict.verdict !== "pass") {
    await appendJsonLine(path.join(stateDir, "truth-verdicts.jsonl"), truthVerdict);
    return {
      schema_version: "parley-turn/v1",
      turnId,
      scene,
      playerAction: trimmedAction,
      narration,
      nextChoices: [],
      characters: [character],
      truthVerdict,
      committed: false
    };
  }

  const turn = {
    schema_version: "parley-turn/v1",
    id: turnId,
    scene_id: scene.id,
    player_action: trimmedAction,
    narration,
    next_choices: nextChoices,
    characters: [character.id],
    truth_verdict: truthVerdict.id
  };

  await appendJsonLine(path.join(stateDir, "turns.jsonl"), turn);
  await appendJsonLine(path.join(stateDir, "truth-verdicts.jsonl"), truthVerdict);
  const worldState = buildWorldState({ scene, turn, character, truthVerdict });
  await writeFile(path.join(stateDir, "world-state.json"), `${JSON.stringify(worldState, null, 2)}\n`, "utf8");

  return {
    schema_version: "parley-turn/v1",
    turnId,
    scene,
    playerAction: trimmedAction,
    narration,
    nextChoices,
    characters: [character],
    truthVerdict,
    worldState,
    committed: true
  };
}

export async function loadCurrentState({
  stateDir = path.join(defaultWorldDir, "state"),
  scenePath = defaultScenePath
} = {}) {
  const scene = await loadSceneSeed(scenePath);
  const worldState = await readJsonIfExists(path.join(stateDir, "world-state.json"));
  const turns = await readJsonLinesIfExists(path.join(stateDir, "turns.jsonl"));
  return {
    scene,
    worldState,
    transcript: turns,
    characters: worldState?.characters ?? [],
    nextChoices: turns.at(-1)?.next_choices ?? []
  };
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

function narrateLastLanternTurn({ playerAction, character }) {
  if (/north road|old road/i.test(playerAction)) {
    return `${character.name} pauses with one hand on a blue chipped bowl, warm enough to keep serving and watchful enough to notice who stops breathing. "The old north road remembers debts better than people do," she says. Around the Last Lantern, talk thins to rain on shutters. "Ashford is a lead, not an answer. For the next thread, ask after the north stones, but spend that name softly and choose who hears it."`;
  }

  return `${character.name} studies you from behind the tavern bar. "Start with what road brought you here," she says, "and I will tell you which names the Last Lantern still remembers."`;
}

function buildProposedFacts({ turnId, character }) {
  return [
    {
      id: "mara-underbough-reusable",
      category: "canon",
      text: "Mara Underbough is established as a recurring tavernkeep the player can return to in later scenes.",
      evidence_turn: turnId,
      character_id: character.id
    },
    {
      id: "old-north-road-rumor",
      category: "rumor",
      text: "The old north road is tied to old debts and the north stones.",
      evidence_turn: turnId,
      source: character.id
    },
    {
      id: "old-north-road-lead",
      category: "lead",
      text: "Ashford is a lead connected to the north stones, not a solved truth.",
      evidence_turn: turnId,
      source: character.id
    },
    {
      id: "ashford-name-belief",
      category: "belief",
      text: "Mara believes saying the Ashford name loudly in the tavern is dangerous or unwise.",
      evidence_turn: turnId,
      character_id: character.id
    },
    {
      id: "ashford-name-mystery",
      category: "unresolved",
      text: "Why the Ashford name unsettles the Last Lantern remains unresolved.",
      evidence_turn: turnId
    }
  ];
}

function buildWorldState({ scene, turn, character, truthVerdict }) {
  return {
    schema_version: "parley-world-state/v1",
    world: {
      id: "last-lantern",
      name: "Last Lantern",
      premise: "A rain-soaked crossroads tavern where travelers trade rumors before the old roads.",
      tone: "grounded fantasy mystery"
    },
    current_scene: {
      id: scene.id,
      title: scene.title,
      crag: scene.crag,
      climb: scene.climb
    },
    characters: [
      {
        id: character.id,
        name: character.name,
        reusable: character.reusable,
        lifecycle: character.lifecycle,
        tags: character.tags,
        belayer_generated_talent: character.belayerGeneratedTalent,
        portrait: character.portrait
      }
    ],
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
