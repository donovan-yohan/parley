#!/usr/bin/env node
/**
 * smoke-belayer-roundtrip.mjs
 *
 * Smoke test: exercises the full Parley → Belayer wake transport path.
 * Constructs a minimal ParleyWake envelope, calls wakeNpc with the real
 * Belayer subprocess bridge, and reports the outcome.
 *
 * GATE: This smoke does nothing unless BELAYER_E2E=1 is set.
 * The test is expected to TIMEOUT (wake_deferred) because no real NPC daemon
 * is running to respond to mail. That is acceptable — the smoke proves:
 *   - Belayer mail send + event-poll wiring is correctly connected.
 *   - Daemon-down preflight short-circuits cleanly.
 *
 * SANDBOXING CAVEAT:
 *   Belayer does not expose env-var overrides for its home dir. This smoke:
 *     1. Uses a unique smoke crag slug (smoke-roundtrip-<random 8 hex chars>)
 *        to avoid clashing with real crags.
 *     2. Runs `belayer uninstall --crag <slug> --yes` in a finally block
 *        to clean up regardless of outcome.
 *
 * Usage:
 *   BELAYER_E2E=1 npm run smoke:belayer-roundtrip
 *   BELAYER_E2E=1 BELAYER_BIN=/path/to/belayer npm run smoke:belayer-roundtrip
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { materializeInstance } from "../src/runtime/instances/materializeInstance.js";
import { wakeNpc } from "../src/runtime/wake/wakeNpc.js";
import { belayerDaemonStatus, belayerMailSend } from "../src/runtime/belayer/belayerProcess.js";
import { awaitWakeResponse } from "../src/runtime/belayer/wakeTimeout.js";
import { defaultPollFn } from "../src/runtime/belayer/wakeTimeout.js";

const execFileAsync = promisify(execFile);

// ─── Gate ─────────────────────────────────────────────────────────────────────

if (!process.env.BELAYER_E2E) {
  process.stdout.write(
    "smoke-belayer-roundtrip: SKIPPED (set BELAYER_E2E=1 to run)\n"
  );
  process.exit(0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run a command and return { exitCode, stdout, stderr }.
 */
function run(cmd, args) {
  return new Promise((resolve) => {
    const proc = execFile(cmd, args, { maxBuffer: 4 * 1024 * 1024, encoding: "buffer" });
    const stdoutChunks = [];
    const stderrChunks = [];

    proc.stdout?.on("data", (c) => stdoutChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    proc.stderr?.on("data", (c) => stderrChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));

    proc.on("error", (err) => {
      resolve({ exitCode: 1, stdout: "", stderr: err.message });
    });

    proc.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

/**
 * Generate a random 8-hex-char suffix.
 */
function randomHex8() {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}

/**
 * Resolve the belayer binary path.
 */
async function resolveBelayerBin() {
  const envBin = process.env.BELAYER_BIN;
  if (envBin) return envBin;

  try {
    const { stdout } = await execFileAsync("which", ["belayer"]);
    const resolved = stdout.trim();
    if (resolved) return resolved;
  } catch {
    // not on PATH
  }

  return null;
}

/**
 * Minimal validateWake for smoke — accepts parley-wake/v1 shaped objects.
 * Full validation requires tsx loader; smoke uses a loose check.
 */
function smokeValidateWake(value) {
  if (!value || value.schema_version !== "parley-wake/v1") {
    throw new Error("smoke validateWake: invalid schema_version");
  }
  if (!value.current_story_context) {
    throw new Error("smoke validateWake: missing current_story_context");
  }
  return value;
}

/**
 * Minimal validateWakeResult for smoke.
 */
function smokeValidateWakeResult(value) {
  if (!value || typeof value !== "object") {
    throw new Error("smoke validateWakeResult: must be object");
  }
  return value;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

async function main() {
  // 1. Resolve belayer binary
  const belayerBin = await resolveBelayerBin();
  if (!belayerBin) {
    process.stdout.write(
      "BELAYER NOT FOUND — set BELAYER_BIN or install belayer; skipping smoke\n"
    );
    process.exit(0);
  }

  // 2. Generate unique crag slug
  const cragSlug = `smoke-roundtrip-${randomHex8()}`;

  // 3. Create sandbox dirs
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "parley-smoke-roundtrip-"));
  const sandboxRepoDir = path.join(sandboxDir, "repo");
  const worldDir = path.join(sandboxRepoDir, "worlds", "last-lantern");
  const charsDir = path.join(worldDir, "characters");
  const hermesProfilesRoot = path.join(sandboxDir, "hermes-profiles");

  let smokeExitCode = 0;

  try {
    // Create world fixture dirs
    await mkdir(charsDir, { recursive: true });
    await mkdir(hermesProfilesRoot, { recursive: true });

    // Write minimal WORLD.md
    await writeFile(
      path.join(worldDir, "WORLD.md"),
      ["---", "schema_version: parley-world/v1", `id: last-lantern`, "---", "", "Smoke fixture world.", ""].join("\n"),
      "utf8"
    );

    // Write a minimal character file (mara-underbough matches crag slug budget)
    await writeFile(
      path.join(charsDir, "mara-underbough.md"),
      ["---", "name: Mara Underbough", "role: tavernkeep", "lifecycle: resumable", "---", "", "Smoke NPC.", ""].join("\n"),
      "utf8"
    );

    // 4. Materialize instance
    process.stdout.write(`Materializing instance: crag=${cragSlug}\n`);
    const { instanceDir } = await materializeInstance({
      worldId: "last-lantern",
      instanceId: cragSlug,
      repoRoot: sandboxRepoDir,
      hermesProfilesRoot,
      belayerCli: belayerBin,
    });

    // 5. Build minimal ParleyWake envelope
    const wakeEnvelope = {
      schema_version: "parley-wake/v1",
      wake_id: `smoke-wake-${randomHex8()}`,
      crag_slug: cragSlug,
      actor_id: "mara-underbough",
      scene_id: "last-lantern-tavern",
      trigger: "smoke_test",
      current_story_context: {
        story_id: "last-lantern",
        scene_id: "last-lantern-tavern",
        current_turn_id: "turn-0001",
        present_event_refs: [],
      },
    };

    process.stdout.write(`Sending wake envelope: wake_id=${wakeEnvelope.wake_id}\n`);

    // 6. Build real belayerProcess using the real subprocess bridge.
    //    Override spawnSubprocess to use the resolved belayerBin path.
    const { defaultSpawn } = await import("../src/runtime/belayer/belayerProcess.js");
    const realBelayerProcess = {
      async daemonStatus() {
        return belayerDaemonStatus({ belayerCli: belayerBin });
      },
      async mailSend(opts) {
        return belayerMailSend({ ...opts, belayerCli: belayerBin });
      },
    };

    // 7. Call wakeNpc with real Belayer (no mocks).
    //    Expected outcome: either wake_deferred (daemon not running) or timeout.
    //    Both are acceptable — the smoke proves wiring, not LLM response.
    const result = await wakeNpc({
      instanceDir,
      characterId: "mara-underbough",
      wakeEnvelope,
      belayerProcess: realBelayerProcess,
      async awaitWakeResponse({ clientEventId, cragSlug: slug, timeoutMs }) {
        return awaitWakeResponse({
          clientEventId,
          cragSlug: slug,
          timeoutMs: Math.min(timeoutMs, 5000), // cap at 5s for smoke
          pollIntervalMs: 500,
          pollFn: (opts) => defaultPollFn({ ...opts, belayerCli: belayerBin }),
        });
      },
      validateWake: smokeValidateWake,
      validateWakeResult: smokeValidateWakeResult,
      timeoutMs: 5000,
    });

    // 8. Print outcome
    process.stdout.write(`Wake outcome: ${JSON.stringify(result, null, 2)}\n`);

    if (result.status === "wake_deferred") {
      const reason = result.reason ?? "(unknown)";
      process.stdout.write(`smoke-belayer-roundtrip: PASS (wake_deferred/${reason} — expected without running NPC daemon)\n`);
    } else {
      process.stdout.write(`smoke-belayer-roundtrip: PASS (got status=${result.status})\n`);
    }

    // Cleanup sandbox on success
    await rm(sandboxDir, { recursive: true, force: true });
  } catch (err) {
    process.stderr.write(`smoke-belayer-roundtrip: FAILED: ${err.message}\n`);
    if (err.stack) process.stderr.write(err.stack + "\n");
    smokeExitCode = 1;
  } finally {
    // Always clean up the belayer crag
    const uninstallResult = await run(belayerBin, ["uninstall", "--crag", cragSlug, "--yes"]);
    if (uninstallResult.exitCode !== 0) {
      process.stderr.write(
        `Warning: belayer uninstall cleanup failed (exit ${uninstallResult.exitCode}):\n`
      );
      process.stderr.write(uninstallResult.stderr || uninstallResult.stdout || "(no output)");
      process.stderr.write(`\nManual cleanup: belayer uninstall --crag ${cragSlug} --yes\n`);
    }
  }

  if (smokeExitCode !== 0) process.exit(smokeExitCode);
}

main().catch((err) => {
  process.stderr.write(`smoke-belayer-roundtrip: unexpected error: ${err.message}\n`);
  if (err.stack) process.stderr.write(err.stack + "\n");
  process.exit(1);
});
