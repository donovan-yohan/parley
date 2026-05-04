#!/usr/bin/env node
/**
 * parley-instance-materialize.mjs
 *
 * CLI for materializing a Parley world instance + Belayer crag.
 *
 * Usage:
 *   npm run instance:materialize -- --world <world-id> --as <instance-id> [options]
 */

import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import { materializeInstance } from "../src/runtime/instances/materializeInstance.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_HERMES_PROFILES_ROOT = path.join(os.homedir(), ".hermes", "profiles");
const DEFAULT_BELAYER_CLI = "belayer";

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `parley instance materialize
  Materialize a Parley world instance + Belayer crag.

Usage:
  npm run instance:materialize -- --world <world-id> --as <instance-id> [options]

Required:
  --world <id>           World template under worlds/<id>/
  --as <id>              Instance id (becomes Belayer crag slug)

Optional:
  --hermes-profiles-root <path>   Default: ~/.hermes/profiles
  --repo-root <path>              Default: current repo
  --belayer-cli <path>            Default: belayer (must be on PATH)
  --force                         Overwrite existing instance
  -h, --help                      Show this help

Example:
  npm run instance:materialize -- --world last-lantern --as last-lantern-alpha
`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2); // drop node + script name

  const opts = {
    worldId: null,
    instanceId: null,
    hermesProfilesRoot: DEFAULT_HERMES_PROFILES_ROOT,
    repoRoot: DEFAULT_REPO_ROOT,
    belayerCli: DEFAULT_BELAYER_CLI,
    force: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case "--world":
        opts.worldId = args[++i];
        break;
      case "--as":
        opts.instanceId = args[++i];
        break;
      case "--hermes-profiles-root":
        opts.hermesProfilesRoot = args[++i];
        break;
      case "--repo-root":
        opts.repoRoot = args[++i];
        break;
      case "--belayer-cli":
        opts.belayerCli = args[++i];
        break;
      case "--force":
        opts.force = true;
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
// Error classification
// ---------------------------------------------------------------------------

/**
 * Translate a materializeInstance error into an actionable user-facing message.
 * @param {Error} err
 * @param {object} opts - parsed CLI opts (for context)
 * @returns {Promise<string>}
 */
async function formatError(err, opts) {
  const msg = err.message ?? String(err);

  // World template not found
  if (msg.includes("world template not found")) {
    let available = [];
    try {
      const worldsDir = path.join(opts.repoRoot, "worlds");
      const entries = await readdir(worldsDir, { withFileTypes: true });
      available = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      // worlds dir unreadable — leave available empty
    }
    const hint =
      available.length > 0
        ? `Run with --world <one of: ${available.join(", ")}> (scanned worlds/ for available templates)`
        : "No world templates found under worlds/. Check --repo-root.";
    return hint;
  }

  // Instance already exists
  if (msg.includes("instance already materialized")) {
    return "Use --force to overwrite, or pick a different --as <id>";
  }

  // Profile name budget validation
  if (msg.includes("profile name budget validation failed")) {
    // Forward field errors verbatim — strip the leading summary line so only
    // the per-character error entries are shown to the user.
    const lines = msg.split("\n");
    return lines.slice(1).join("\n");
  }

  // Belayer crag init failure
  if (msg.includes("belayer crag init failed")) {
    let hint = msg;
    if (msg.includes("auth") || msg.includes("unauthorized") || msg.includes("401")) {
      hint += "\n\nSuggestion: run `belayer auth ensure` then retry.";
    } else if (
      msg.includes("connect") ||
      msg.includes("daemon") ||
      msg.includes("ECONNREFUSED")
    ) {
      hint += "\n\nSuggestion: start the Belayer daemon with `belayer daemon` then retry.";
    } else {
      hint +=
        "\n\nSuggestions: ensure `belayer auth ensure` has been run and `belayer daemon` is running.";
    }
    return hint;
  }

  // Unrecognized error — return as-is
  return msg;
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

  // Validate required args
  const missing = [];
  if (!opts.worldId) missing.push("--world");
  if (!opts.instanceId) missing.push("--as");

  if (missing.length > 0) {
    process.stderr.write(`Missing required argument(s): ${missing.join(", ")}\n\n`);
    process.stderr.write(HELP);
    process.exit(1);
  }

  try {
    const result = await materializeInstance({
      worldId: opts.worldId,
      instanceId: opts.instanceId,
      repoRoot: opts.repoRoot,
      hermesProfilesRoot: opts.hermesProfilesRoot,
      belayerCli: opts.belayerCli,
      force: opts.force,
    });

    // Success summary
    const profileNames = result.profiles.map((p) => p.profileName);
    process.stdout.write("Instance materialized successfully.\n");
    process.stdout.write(`  Instance dir:   ${result.instanceDir}\n`);
    process.stdout.write(`  Manifest:       ${result.manifestPath}\n`);
    if (profileNames.length > 0) {
      process.stdout.write(`  Profiles:\n`);
      for (const p of result.profiles) {
        const tag = p.alreadyExists ? " (already existed)" : "";
        process.stdout.write(`    - ${p.profileName}${tag}\n`);
      }
    } else {
      process.stdout.write("  Profiles:       (none — no characters found)\n");
    }
  } catch (err) {
    const message = await formatError(err, opts);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main();
