import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateStoryAttractor } from "./dm/detourContracts.js";

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(runtimeDir, "..", "..");
export const scenariosDir = path.join(repoRoot, "scenarios");
export const defaultScenarioId = "last-lantern";

export async function listScenarioPacks() {
  const entries = await readdir(scenariosDir, { withFileTypes: true });
  const scenarios = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => loadScenarioPack(entry.name))
  );

  return scenarios
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((scenario) => scenarioMetadata(scenario));
}

export async function loadScenarioPack(scenarioId = defaultScenarioId) {
  const id = normalizeScenarioId(scenarioId);
  const scenarioPath = path.join(scenariosDir, id, "scenario.json");
  const raw = await readFile(scenarioPath, "utf8");
  const scenario = JSON.parse(raw);
  validateScenarioPack(scenario, scenarioPath);
  const worldId = normalizeWorldId(scenario.world?.id, scenarioPath);
  return {
    ...scenario,
    scenarioPath,
    stateDir: path.join(repoRoot, "worlds", worldId, "state"),
    worldDir: path.join(repoRoot, "worlds", worldId)
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

  if (!Array.isArray(scenario.characters) || scenario.characters.length === 0) {
    throw new Error(`${scenarioPath} must define at least one character`);
  }

  if (!Array.isArray(scenario.responses) || scenario.responses.length === 0) {
    throw new Error(`${scenarioPath} must define at least one response`);
  }

  if (!Array.isArray(scenario.proposedFacts) || scenario.proposedFacts.length === 0) {
    throw new Error(`${scenarioPath} must define proposedFacts`);
  }

  validateOptionalDetourData(scenario, scenarioPath);
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
    if (!Array.isArray(guidance.targetAttractorIds) || guidance.targetAttractorIds.length === 0) {
      throw new Error(`${scenarioPath} dmDetourGuidance ${guidance.id} must target at least one attractor`);
    }
    for (const targetAttractorId of guidance.targetAttractorIds) {
      if (!attractorIds.has(targetAttractorId)) {
        throw new Error(`${scenarioPath} dmDetourGuidance ${guidance.id} targets unknown attractor ${targetAttractorId}`);
      }
    }
  }
}
