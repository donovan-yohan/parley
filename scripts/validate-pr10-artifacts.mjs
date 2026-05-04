#!/usr/bin/env node
/**
 * validate-pr10-artifacts.mjs
 *
 * Validates PR #10 artifacts (story attractors + DM runtime artifacts)
 * against the Zod schemas in src/contracts/.
 *
 * Usage:
 *   node --import tsx scripts/validate-pr10-artifacts.mjs [--with-smoke]
 *
 *   --with-smoke  Run a mini smoke against worlds/<id>/state/ before validating,
 *                 even if artifacts already exist.
 */

import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  StoryAttractorSchema,
  ActionInterpretationSchema,
  DetourScene as DetourSceneSchema,
  StoryConsequenceSchema,
  BeatRedirectSchema,
  safeParseWithFieldErrors,
} from "../src/contracts/index.ts";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SCENARIO_IDS = ["last-lantern", "neon-afterhours", "orchard-welcome"];

const ARTIFACT_SCHEMAS = {
  "action-interpretations.jsonl": ActionInterpretationSchema,
  "detour-scenes.jsonl": DetourSceneSchema,
  "story-consequences.jsonl": StoryConsequenceSchema,
  "beat-redirects.jsonl": BeatRedirectSchema,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return true if a file exists and is accessible. */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Read a .jsonl file and return parsed objects. Skips blank lines. */
async function readJsonLines(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      try {
        return { lineNo: i + 1, data: JSON.parse(line), parseError: null };
      } catch (e) {
        return { lineNo: i + 1, data: null, parseError: e.message };
      }
    });
}

/** Check whether any PR #10 runtime artifact exists under worlds/<id>/state/. */
async function anyRuntimeArtifactExists() {
  for (const scenarioId of SCENARIO_IDS) {
    for (const fileName of Object.keys(ARTIFACT_SCHEMAS)) {
      const p = path.join(repoRoot, "worlds", scenarioId, "state", fileName);
      if (await fileExists(p)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Mini smoke: populate worlds/<id>/state/ via runPlayerTurn
// ---------------------------------------------------------------------------

async function runSmoke() {
  console.log("Running mini smoke to populate worlds/*/state/ with DM artifacts…");

  // Lazy-import runtime (not needed if smoke is skipped)
  const { runPlayerTurn } = await import("../src/runtime/parleyRuntime.js");

  const smokeConfig = [
    {
      scenarioId: "last-lantern",
      // Default action — always produces action-interpretations
      actions: [
        "I ask who remembers the old north road.",
        // Detour-triggering action
        "I leap onto a table and declare I own the Last Lantern.",
      ],
    },
    {
      scenarioId: "neon-afterhours",
      actions: [
        "I ask who signed the audit lockout.",
        // Detour-triggering action
        "I smash the badge reader.",
      ],
    },
    {
      scenarioId: "orchard-welcome",
      actions: [
        "I ask who keeps leaving lantern pears at my gate.",
        // Detour-triggering action
        "I threaten to salt the fields.",
      ],
    },
  ];

  let allOk = true;

  for (const { scenarioId, actions } of smokeConfig) {
    const stateDir = path.join(repoRoot, "worlds", scenarioId, "state");
    const worldDir = path.join(repoRoot, "worlds", scenarioId);

    for (const playerAction of actions) {
      try {
        const result = await runPlayerTurn({ scenarioId, playerAction, stateDir, worldDir });
        if (!result.committed) {
          console.error(`  [smoke fail] ${scenarioId}: action="${playerAction}" — truth verdict failed`);
          allOk = false;
        } else {
          const hasDetour = result.authoredTurn?.detourScene != null;
          console.log(`  [smoke ok] ${scenarioId}: action="${playerAction}"${hasDetour ? " (detour fired)" : ""}`);
        }
      } catch (err) {
        console.error(`  [smoke error] ${scenarioId}: action="${playerAction}" — ${err.message}`);
        allOk = false;
      }
    }
  }

  if (!allOk) {
    console.error("\nSmoke failed — aborting validation.");
    process.exit(1);
  }

  console.log("");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const summaryLines = [];
const failures = [];

/** Validate all storyAttractors in a scenario.json. */
async function validateScenarioAttractors(scenarioId) {
  const scenarioPath = path.join(repoRoot, "scenarios", scenarioId, "scenario.json");
  const raw = JSON.parse(await readFile(scenarioPath, "utf8"));

  // Support both "storyAttractors" (camelCase in JSON) and "story_attractors"
  const attractors = raw.storyAttractors ?? raw.story_attractors ?? [];

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < attractors.length; i++) {
    const attractor = attractors[i];
    const result = safeParseWithFieldErrors(StoryAttractorSchema, attractor);
    if (result.ok) {
      process.stdout.write(`  [ok] scenarios/${scenarioId} attractor[${i}] id=${attractor.id}\n`);
      ok++;
    } else {
      process.stdout.write(
        `  [fail] scenarios/${scenarioId} attractor[${i}] id=${attractor.id ?? "?"}\n`
      );
      for (const err of result.errors) {
        process.stdout.write(`         field=${err.path || "(root)"}: ${err.message}\n`);
        failures.push({
          source: `scenarios/${scenarioId}/scenario.json attractor[${i}]`,
          path: err.path || "(root)",
          message: err.message,
        });
      }
      fail++;
    }
  }

  const label = `scenarios/${scenarioId}`;
  if (fail === 0) {
    summaryLines.push(`─ ${label}: ${ok} attractor${ok === 1 ? "" : "s"} ok`);
  } else {
    summaryLines.push(`─ ${label}: ${ok} ok, ${fail} FAILED`);
  }
}

/** Validate all lines in a runtime .jsonl artifact file. */
async function validateArtifactFile(filePath, schema, label) {
  if (!(await fileExists(filePath))) {
    // Not present — skip (optional files)
    return;
  }

  const lines = await readJsonLines(filePath);
  if (lines.length === 0) {
    summaryLines.push(`─ ${label}: (empty)`);
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const { lineNo, data, parseError } of lines) {
    if (parseError) {
      process.stdout.write(`  [fail line ${lineNo}: JSON parse error] ${parseError}\n`);
      failures.push({ source: `${label}:${lineNo}`, path: "(JSON)", message: parseError });
      fail++;
      continue;
    }

    const result = safeParseWithFieldErrors(schema, data);
    if (result.ok) {
      process.stdout.write(`  [ok] ${label} line ${lineNo}\n`);
      ok++;
    } else {
      for (const err of result.errors) {
        process.stdout.write(
          `  [fail line ${lineNo}: ${err.path || "(root)"}] ${err.message}\n`
        );
        failures.push({
          source: `${label}:${lineNo}`,
          path: err.path || "(root)",
          message: err.message,
        });
      }
      fail++;
    }
  }

  const total = ok + fail;
  if (fail === 0) {
    summaryLines.push(`─ ${label}: ${ok}/${total} ok`);
  } else {
    summaryLines.push(`─ ${label}: ${ok}/${total} ok, ${fail} FAILED`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const withSmoke = args.includes("--with-smoke");

// Decide whether to run smoke
if (withSmoke || !(await anyRuntimeArtifactExists())) {
  await runSmoke();
}

console.log("PR #10 artifact validation");
console.log("");

// 1. Validate storyAttractors from scenario fixtures
for (const scenarioId of SCENARIO_IDS) {
  await validateScenarioAttractors(scenarioId);
}

// 2. Validate runtime artifacts from worlds/*/state/
for (const scenarioId of SCENARIO_IDS) {
  const stateDir = path.join(repoRoot, "worlds", scenarioId, "state");
  for (const [fileName, schema] of Object.entries(ARTIFACT_SCHEMAS)) {
    const filePath = path.join(stateDir, fileName);
    const label = `worlds/${scenarioId}/state/${fileName}`;
    await validateArtifactFile(filePath, schema, label);
  }
}

// 3. Print summary
console.log("");
console.log("PR #10 artifact validation");
for (const line of summaryLines) {
  console.log(line);
}

if (failures.length === 0) {
  console.log("\nPASS — all PR #10 artifacts validate via Zod");
  process.exit(0);
} else {
  console.log("\nFAIL — the following artifacts did not validate:");
  for (const f of failures) {
    console.log(`  ${f.source}  field=${f.path}: ${f.message}`);
  }
  process.exit(1);
}
