import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateStoryAttractor } from "./dm/detourContracts.js";

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(runtimeDir, "..", "..");
export const defaultScenarioId = "last-lantern";

export async function ensureInstanceDir(instanceDir) {
  await mkdir(instanceDir, { recursive: true });
}

export async function listScenarioPacks() {
  const worldsDir = path.join(repoRoot, "worlds");
  const worldEntries = await readdir(worldsDir, { withFileTypes: true });
  const scenarioIds = [];
  for (const worldEntry of worldEntries) {
    if (!worldEntry.isDirectory()) {
      continue;
    }
    const scenariosDirForWorld = path.join(worldsDir, worldEntry.name, "scenarios");
    let scenarioEntries;
    try {
      scenarioEntries = await readdir(scenariosDirForWorld, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const scenarioEntry of scenarioEntries) {
      if (scenarioEntry.isDirectory()) {
        scenarioIds.push(scenarioEntry.name);
      }
    }
  }

  const settled = await Promise.allSettled(
    scenarioIds.map((id) => loadScenarioPack(id))
  );

  const scenarios = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      scenarios.push(result.value);
    } else {
      console.warn(`[parley] skipping scenario directory: ${result.reason?.message ?? result.reason}`);
    }
  }

  return scenarios
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((scenario) => scenarioMetadata(scenario));
}

export async function loadScenarioPack(scenarioId = defaultScenarioId) {
  const id = normalizeScenarioId(scenarioId);
  const worldId = id; // 1a invariant; future PRs may decouple
  const scenarioPath = path.join(repoRoot, "worlds", worldId, "scenarios", id, "scenario.json");
  const raw = await readFile(scenarioPath, "utf8");
  const scenario = JSON.parse(raw);
  validateScenarioPack(scenario, scenarioPath);
  normalizeWorldId(scenario.world?.id, scenarioPath);
  return {
    ...scenario,
    scenarioPath,
    worldDir: path.join(repoRoot, "worlds", worldId),
    instanceDir: path.join(repoRoot, "instances", worldId, "playthrough-1")
  };
}

export function scenarioMetadata(scenario) {
  return {
    id: scenario.id,
    title: scenario.title,
    subtitle: scenario.subtitle,
    themeId: scenario.themeId,
    defaultPlayerAction: scenario.defaultPlayerAction,
    openingNarration: scenario.openingNarration,
    suggestedPlayerIntents: scenario.suggestedPlayerIntents,
    world: scenario.world,
    scene: scenario.scene
  };
}

function normalizeScenarioId(scenarioId) {
  const id = String(scenarioId || defaultScenarioId).trim();
  if (!/^[a-z0-9-]+$/.test(id)) {
    const error = new Error(`Invalid scenario id: ${scenarioId}`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function normalizeWorldId(worldId, scenarioPath) {
  const id = String(worldId ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`${scenarioPath} has invalid world.id ${JSON.stringify(worldId)} (must match /^[a-z0-9][a-z0-9-]*$/)`);
  }
  return id;
}

function validateScenarioPack(scenario, scenarioPath) {
  for (const key of [
    "id",
    "title",
    "subtitle",
    "themeId",
    "defaultPlayerAction",
    "openingNarration",
    "suggestedPlayerIntents",
    "world",
    "scene",
    "characters",
    "responses",
    "proposedFacts"
  ]) {
    if (scenario[key] === undefined) {
      throw new Error(`${scenarioPath} missing required key ${key}`);
    }
  }

  if (!["last-lantern", "cyberpunk", "cozy"].includes(scenario.themeId)) {
    throw new Error(`${scenarioPath} has unsupported themeId ${scenario.themeId}`);
  }

  if (!scenario.world || typeof scenario.world !== "object" || Array.isArray(scenario.world)) {
    throw new Error(`${scenarioPath} world must be an object`);
  }
  if (!String(scenario.world.id ?? "").trim()) {
    throw new Error(`${scenarioPath} world.id is required`);
  }

  if (!scenario.scene || typeof scenario.scene !== "object" || Array.isArray(scenario.scene)) {
    throw new Error(`${scenarioPath} scene must be an object`);
  }
  if (!String(scenario.scene.id ?? "").trim()) {
    throw new Error(`${scenarioPath} scene.id is required`);
  }

  if (!Array.isArray(scenario.characters) || scenario.characters.length === 0) {
    throw new Error(`${scenarioPath} must define at least one character`);
  }
  validateScenarioCharacters(scenario.characters, scenarioPath);

  if (!Array.isArray(scenario.responses) || scenario.responses.length === 0) {
    throw new Error(`${scenarioPath} must define at least one response`);
  }
  validateScenarioResponses(scenario.responses, scenarioPath);

  if (!Array.isArray(scenario.proposedFacts) || scenario.proposedFacts.length === 0) {
    throw new Error(`${scenarioPath} must define proposedFacts`);
  }

  validateOptionalDetourData(scenario, scenarioPath);
}

function validateScenarioCharacters(characters, scenarioPath) {
  const seenIds = new Set();
  for (const [index, character] of characters.entries()) {
    if (!character || typeof character !== "object" || Array.isArray(character)) {
      throw new Error(`${scenarioPath} characters[${index}] must be an object`);
    }
    for (const key of ["id", "name", "role"]) {
      if (!String(character[key] ?? "").trim()) {
        throw new Error(`${scenarioPath} characters[${index}] missing ${key}`);
      }
    }
    if (seenIds.has(character.id)) {
      throw new Error(`${scenarioPath} characters duplicate id ${character.id}`);
    }
    seenIds.add(character.id);
  }
}

function validateScenarioResponses(responses, scenarioPath) {
  const seenIds = new Set();
  for (const [index, response] of responses.entries()) {
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      throw new Error(`${scenarioPath} responses[${index}] must be an object`);
    }
    for (const key of ["id", "narration"]) {
      if (!String(response[key] ?? "").trim()) {
        throw new Error(`${scenarioPath} responses[${index}] missing ${key}`);
      }
    }
    if (seenIds.has(response.id)) {
      throw new Error(`${scenarioPath} responses duplicate id ${response.id}`);
    }
    seenIds.add(response.id);
    if (response.id !== "fallback") {
      if (!Array.isArray(response.matchAny) || response.matchAny.length === 0) {
        throw new Error(`${scenarioPath} responses[${index}] (${response.id}) must define matchAny phrases`);
      }
    }
  }
}

function validateOptionalDetourData(scenario, scenarioPath) {
  if (scenario.storyAttractors !== undefined) {
    if (!Array.isArray(scenario.storyAttractors)) {
      throw new Error(`${scenarioPath} storyAttractors must be an array`);
    }
    for (const attractor of scenario.storyAttractors) {
      validateStoryAttractor(attractor);
    }
  }

  if (scenario.dmDetourGuidance === undefined) {
    return;
  }

  if (!Array.isArray(scenario.dmDetourGuidance)) {
    throw new Error(`${scenarioPath} dmDetourGuidance must be an array`);
  }

  const attractorIds = new Set((scenario.storyAttractors ?? []).map((attractor) => attractor.id));
  for (const guidance of scenario.dmDetourGuidance) {
    for (const key of ["id", "intent", "claimPolicy", "consequenceLevel", "narration"]) {
      if (!String(guidance[key] ?? "").trim()) {
        throw new Error(`${scenarioPath} dmDetourGuidance entry missing ${key}`);
      }
    }
    if (!Array.isArray(guidance.matchAnyGroups) || guidance.matchAnyGroups.length === 0) {
      throw new Error(`${scenarioPath} dmDetourGuidance ${guidance.id} must define matchAnyGroups`);
    }
    for (const [groupIndex, group] of guidance.matchAnyGroups.entries()) {
      if (!Array.isArray(group) || group.length === 0) {
        throw new Error(`${scenarioPath} dmDetourGuidance ${guidance.id} matchAnyGroups[${groupIndex}] must be a non-empty array of phrases`);
      }
      for (const [phraseIndex, phrase] of group.entries()) {
        if (typeof phrase !== "string" || !phrase.trim()) {
          throw new Error(`${scenarioPath} dmDetourGuidance ${guidance.id} matchAnyGroups[${groupIndex}][${phraseIndex}] must be a non-empty string`);
        }
      }
    }
    if (guidance.matchAny !== undefined && !Array.isArray(guidance.matchAny)) {
      throw new Error(`${scenarioPath} dmDetourGuidance ${guidance.id} matchAny must be an array when provided`);
    }
    if (guidance.matchRequired !== undefined && !Array.isArray(guidance.matchRequired)) {
      throw new Error(`${scenarioPath} dmDetourGuidance ${guidance.id} matchRequired must be an array when provided`);
    }
    if (!Array.isArray(guidance.targetAttractorIds) || guidance.targetAttractorIds.length === 0) {
      throw new Error(`${scenarioPath} dmDetourGuidance ${guidance.id} must target at least one attractor`);
    }
    for (const targetAttractorId of guidance.targetAttractorIds) {
      if (!attractorIds.has(targetAttractorId)) {
        throw new Error(`${scenarioPath} dmDetourGuidance ${guidance.id} targets unknown attractor ${targetAttractorId}`);
      }
    }

    guidance._normalizedMatchAnyGroups = guidance.matchAnyGroups.map((group) =>
      (group ?? []).map(normalizeDetourPhrase)
    );
    guidance._normalizedMatchAny = (guidance.matchAny ?? []).map(normalizeDetourPhrase);
    guidance._normalizedMatchRequired = (guidance.matchRequired ?? []).map(normalizeDetourPhrase);
  }
}

function normalizeDetourPhrase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
