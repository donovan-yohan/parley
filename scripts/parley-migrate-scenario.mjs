#!/usr/bin/env node
/**
 * parley-migrate-scenario.mjs
 *
 * Migrate a scenario seed from `scene.crag` (old) to `scene.instance` (new).
 *
 * Usage:
 *   node scripts/parley-migrate-scenario.mjs --scenario <id> [options]
 */

import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `parley migrate-scenario
  Migrate a scenario seed file from scene.crag (legacy) to scene.instance.

Usage:
  node scripts/parley-migrate-scenario.mjs --scenario <id> [options]

Required:
  --scenario <id>         Scenario id under scenarios/<id>/scenario.json

Optional:
  --instance <id>         Target instance id. Default: <world.id>-default
  --also-scene <path>     YAML scene seed to also rewrite (repeatable)
  --dry-run               Print planned changes without writing any files
  -h, --help              Show this help

Examples:
  node scripts/parley-migrate-scenario.mjs --scenario last-lantern
  node scripts/parley-migrate-scenario.mjs --scenario last-lantern --also-scene examples/last-lantern/scene.yaml
  node scripts/parley-migrate-scenario.mjs --scenario last-lantern --instance last-lantern-v2 --dry-run
`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);

  const opts = {
    scenarioId: null,
    instanceId: null,
    alsoScenes: [],
    dryRun: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case "--scenario":
        opts.scenarioId = args[++i];
        break;
      case "--instance":
        opts.instanceId = args[++i];
        break;
      case "--also-scene":
        opts.alsoScenes.push(args[++i]);
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      default:
        process.stderr.write(`Unknown option: ${arg}\n`);
        process.exit(1);
    }

    i++;
  }

  return opts;
}

// ---------------------------------------------------------------------------
// JSON migration
// ---------------------------------------------------------------------------

/**
 * Migrate the scenario JSON file.
 * Returns { scenarioPath, oldValue, newValue, changed } or exits.
 */
async function migrateScenarioJson(scenarioId, instanceIdOverride, dryRun) {
  const scenarioPath = path.join(REPO_ROOT, "scenarios", scenarioId, "scenario.json");

  let raw;
  try {
    raw = await readFile(scenarioPath, "utf-8");
  } catch (err) {
    process.stderr.write(`Error reading scenario file: ${scenarioPath}\n${err.message}\n`);
    process.exit(1);
  }

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`Error parsing JSON at ${scenarioPath}\n${err.message}\n`);
    process.exit(1);
  }

  // Check whether the crag field exists in scene
  const scene = obj.scene;
  if (!scene || typeof scene !== "object") {
    process.stderr.write(`No scene object found in ${scenarioPath}\n`);
    process.exit(1);
  }

  if (!("crag" in scene)) {
    process.stdout.write(`${scenarioPath}: already migrated (no 'crag' field found). Skipping.\n`);
    return { scenarioPath, changed: false };
  }

  const oldValue = scene.crag;

  // Determine the target instance id
  const worldId = obj.world?.id ?? scenarioId;
  const newValue = instanceIdOverride ?? `${worldId}-default`;

  if (dryRun) {
    process.stdout.write(`[dry-run] ${scenarioPath}:\n`);
    process.stdout.write(`  scene.crag: "${oldValue}" → scene.instance: "${newValue}"\n`);
    return { scenarioPath, oldValue, newValue, changed: true };
  }

  // Mutate: rebuild scene with instance inserted at the position crag occupied.
  // Re-parse the original to get key order, then rebuild.
  const origScene = JSON.parse(raw).scene;
  const newScene = {};
  for (const key of Object.keys(origScene)) {
    if (key === "crag") {
      newScene["instance"] = newValue;
    } else {
      newScene[key] = origScene[key];
    }
  }
  obj.scene = newScene;

  const output = JSON.stringify(obj, null, 2) + "\n";

  await writeFile(scenarioPath, output, "utf-8");

  process.stdout.write(`${scenarioPath}:\n`);
  process.stdout.write(`  scene.crag: "${oldValue}" → scene.instance: "${newValue}"\n`);

  return { scenarioPath, oldValue, newValue, changed: true };
}

// ---------------------------------------------------------------------------
// YAML migration (line-based, flat scene seed)
// ---------------------------------------------------------------------------

/**
 * Migrate a flat YAML scene seed file.
 * Finds a top-level `crag: <value>` line and replaces it with `instance: <new-value>`.
 */
async function migrateSceneYaml(yamlPath, instanceIdOverride, worldId, dryRun) {
  const fullPath = path.isAbsolute(yamlPath)
    ? yamlPath
    : path.join(REPO_ROOT, yamlPath);

  let raw;
  try {
    raw = await readFile(fullPath, "utf-8");
  } catch (err) {
    process.stderr.write(`Error reading scene YAML: ${fullPath}\n${err.message}\n`);
    process.exit(1);
  }

  const lines = raw.split("\n");

  // Find the line matching `crag: <value>` at the top level (no leading indent)
  const cragLineIndex = lines.findIndex((line) => /^crag:\s*\S/.test(line));

  if (cragLineIndex === -1) {
    process.stdout.write(`${fullPath}: already migrated (no top-level 'crag:' line). Skipping.\n`);
    return { yamlPath: fullPath, changed: false };
  }

  const oldLine = lines[cragLineIndex];
  const oldValueMatch = oldLine.match(/^crag:\s*(.+)$/);
  const oldValue = oldValueMatch ? oldValueMatch[1].trim() : "";

  const newValue = instanceIdOverride ?? `${worldId ?? oldValue}-default`;
  const newLine = `instance: ${newValue}`;

  if (dryRun) {
    process.stdout.write(`[dry-run] ${fullPath}:\n`);
    process.stdout.write(`  line ${cragLineIndex + 1}: "${oldLine}" → "${newLine}"\n`);
    return { yamlPath: fullPath, oldLine, newLine, changed: true };
  }

  lines[cragLineIndex] = newLine;
  const output = lines.join("\n");

  await writeFile(fullPath, output, "utf-8");

  process.stdout.write(`${fullPath}:\n`);
  process.stdout.write(`  line ${cragLineIndex + 1}: "${oldLine}" → "${newLine}"\n`);

  return { yamlPath: fullPath, oldLine, newLine, changed: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (!opts.scenarioId) {
    process.stderr.write(`Missing required argument: --scenario\n\n`);
    process.stderr.write(HELP);
    process.exit(1);
  }

  if (opts.dryRun) {
    process.stdout.write("[dry-run mode — no files will be written]\n\n");
  }

  // Migrate the scenario JSON
  const jsonResult = await migrateScenarioJson(opts.scenarioId, opts.instanceId, opts.dryRun);

  // Derive world id for use in YAML migration fallback
  let worldId = opts.scenarioId; // fallback
  try {
    const scenarioPath = path.join(REPO_ROOT, "scenarios", opts.scenarioId, "scenario.json");
    const raw = await readFile(scenarioPath, "utf-8");
    const obj = JSON.parse(raw);
    if (obj.world?.id) worldId = obj.world.id;
  } catch {
    // ignore — worldId stays as scenarioId
  }

  // Migrate any --also-scene files
  for (const yamlPath of opts.alsoScenes) {
    await migrateSceneYaml(yamlPath, opts.instanceId, worldId, opts.dryRun);
  }

  process.stdout.write("\nDone.\n");
}

main();
