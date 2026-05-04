#!/usr/bin/env node
/**
 * parley-promote-from-eval
 *
 * CLI wrapper around promoteFromEval. Reads a world-instance-evaluation.json,
 * lets the DM accept/reject each promotion candidate (interactively or via
 * --accept-all), then invokes belayer promote and writes accepted facts into
 * worlds/<world-id>/lore/promoted-facts.jsonl.
 *
 * Usage:
 *   node scripts/parley-promote-from-eval.mjs \
 *     --eval <path>           path to world-instance-evaluation.json
 *     --world <world-id>      world directory name under <repo-root>/worlds/
 *     [--repo-root <path>]    defaults to cwd
 *     [--belayer-cli <path>]  defaults to "belayer"
 *     [--accept-all]          skip prompts, accept all candidates
 *     [--dry-run]             print what would be promoted without writing
 */

import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { promoteFromEval } from "../src/runtime/indexer/promoteFromEval.js";

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    eval: null,
    world: null,
    repoRoot: process.cwd(),
    belayerCli: "belayer",
    acceptAll: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--eval") result.eval = args[++i];
    else if (arg === "--world") result.world = args[++i];
    else if (arg === "--repo-root") result.repoRoot = args[++i];
    else if (arg === "--belayer-cli") result.belayerCli = args[++i];
    else if (arg === "--accept-all") result.acceptAll = true;
    else if (arg === "--dry-run") result.dryRun = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!result.eval) {
    console.error("Error: --eval <path> is required");
    process.exit(1);
  }
  if (!result.world) {
    console.error("Error: --world <world-id> is required");
    process.exit(1);
  }

  return result;
}

// ─── Interactive prompter ─────────────────────────────────────────────────────

function makeInteractiveAcceptor() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) =>
    new Promise((resolve) => rl.question(question, resolve));

  const acceptCandidate = async (candidate) => {
    console.log("\nPromotion candidate:");
    console.log(JSON.stringify(candidate, null, 2));
    const answer = await ask("Accept this candidate? [Y/n] ");
    const trimmed = answer.trim().toLowerCase();
    return trimmed === "" || trimmed === "y" || trimmed === "yes";
  };

  const close = () => rl.close();

  return { acceptCandidate, close };
}

// ─── Belayer invoker ──────────────────────────────────────────────────────────

function makeBelayerPromote(belayerCli) {
  return ({ evalPath, accepted }) =>
    new Promise((resolve) => {
      const proc = spawn(belayerCli, ["promote", evalPath], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => { stdout += d; });
      proc.stderr.on("data", (d) => { stderr += d; });
      proc.on("close", (code) => {
        if (code === 0) {
          resolve({ ok: true, stdout, stderr });
        } else {
          resolve({ ok: false, stdout, stderr });
        }
      });
      proc.on("error", (err) => {
        resolve({ ok: false, stderr: err.message });
      });
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  const evalArtifactPath = path.resolve(opts.repoRoot, opts.eval);
  const worldDir = path.resolve(opts.repoRoot, "worlds", opts.world);

  if (opts.dryRun) {
    // Read and display what would be promoted without writing anything.
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(evalArtifactPath, "utf8").catch(() => null);
    if (!raw) {
      console.error(`Error: eval file not found: ${evalArtifactPath}`);
      process.exit(1);
    }
    const eval_ = JSON.parse(raw);
    const candidates = eval_.promotion_candidates ?? [];
    console.log(`[dry-run] Would promote ${candidates.length} candidate(s) from:`);
    console.log(`  eval:  ${evalArtifactPath}`);
    console.log(`  world: ${worldDir}`);
    console.log(`  lore:  ${path.join(worldDir, "lore", "promoted-facts.jsonl")}`);
    if (candidates.length > 0) {
      console.log("\nCandidates:");
      for (const cand of candidates) {
        console.log(" -", JSON.stringify(cand));
      }
    }
    return;
  }

  let acceptCandidate;
  let cleanup = () => {};

  if (opts.acceptAll) {
    acceptCandidate = async () => true;
  } else {
    const interactor = makeInteractiveAcceptor();
    acceptCandidate = interactor.acceptCandidate;
    cleanup = interactor.close;
  }

  const belayerPromote = makeBelayerPromote(opts.belayerCli);

  try {
    const result = await promoteFromEval({
      evalArtifactPath,
      worldDir,
      acceptCandidate,
      belayerPromote,
    });

    cleanup();

    if (result.ok) {
      console.log(`\nPromotion complete.`);
      console.log(`  Accepted: ${result.accepted.length}`);
      console.log(`  Rejected: ${result.rejected.length}`);
      if (result.belayerInvoked && result.promotedPath) {
        console.log(`  Written:  ${result.promotedPath}`);
      } else if (!result.belayerInvoked) {
        console.log(`  (No candidates accepted — belayer not invoked.)`);
      }
    } else {
      console.error(`\nPromotion failed: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    cleanup();
    console.error(`\nUnexpected error: ${err.message}`);
    process.exit(1);
  }
}

main();
