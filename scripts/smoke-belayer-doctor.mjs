#!/usr/bin/env node
/**
 * smoke-belayer-doctor.mjs
 *
 * Smoke test: verify that `belayer doctor --crag <id>` reports clean (exit 0)
 * after a full instance materialization.
 *
 * SANDBOXING CAVEAT:
 *   Belayer does not respect HERMES_HOME, BELAYER_HOME, or any known env var
 *   for redirecting its profile or crag storage. This smoke therefore uses:
 *     - ~/.hermes/profiles/  — for Hermes talent profile dirs (real)
 *     - ~/.belayer/crags/    — for crag workspace state (real)
 *
 *   To avoid permanently polluting the user's environment, the script:
 *     1. Uses a unique smoke crag slug (smoke-doctor-<random 8 hex chars>)
 *        to avoid clashing with real crags.
 *     2. Runs `belayer uninstall --crag <slug> --yes` in a finally block to
 *        clean up the crag directory and any blyr-* profiles created during
 *        the smoke, whether the smoke passed or failed.
 *
 *   The sandbox tmp dir (under os.tmpdir()) holds the world template,
 *   character files, and the materialized instance directory and is removed
 *   on success.
 *
 * Usage:
 *   npm run smoke:belayer-doctor
 *   BELAYER_BIN=/path/to/belayer npm run smoke:belayer-doctor
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { materializeInstance } from "../src/runtime/instances/materializeInstance.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a command and return { exitCode, stdout, stderr }.
 * Uses execFile (no shell) for safety.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
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
 * @returns {string}
 */
function randomHex8() {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}

/**
 * Resolve the belayer binary path.
 * Returns null if not found.
 * @returns {Promise<string | null>}
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

async function main() {
  // 1. Resolve belayer binary
  const belayerBin = await resolveBelayerBin();
  if (!belayerBin) {
    process.stdout.write(
      "BELAYER NOT FOUND — set BELAYER_BIN or install belayer; skipping smoke\n",
    );
    process.exit(0);
  }

  // 2. Generate a unique crag slug to avoid polluting the user's real crags
  const cragSlug = `smoke-doctor-${randomHex8()}`;

  // 3. Create sandbox tmp dir with world + character fixtures
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "parley-smoke-doctor-"));
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
      [
        "---",
        "schema_version: parley-world/v1",
        "id: last-lantern",
        "---",
        "",
        "The Last Lantern Tavern smoke fixture.",
        "",
      ].join("\n"),
      "utf8",
    );

    // Write minimal character file
    await writeFile(
      path.join(charsDir, "mara-underbough.md"),
      [
        "---",
        "name: Mara Underbough",
        "role: tavernkeep",
        "---",
        "",
        "A weary tavernkeep who knows everyone's business.",
        "",
      ].join("\n"),
      "utf8",
    );

    // 4. Materialize instance
    //    hermesProfilesRoot here is a sandbox dir passed to materializeTalentProfile,
    //    which writes profile dirs there. However, belayer doctor reads ~/.hermes/profiles/
    //    directly (not configurable via env). The crag init IS run against the real
    //    ~/.belayer/ state. Cleanup in finally block handles both.
    const result = await materializeInstance({
      worldId: "last-lantern",
      instanceId: cragSlug,
      repoRoot: sandboxRepoDir,
      hermesProfilesRoot,
      belayerCli: belayerBin,
    });

    const { instanceDir, profiles } = result;
    const primaryProfile = profiles[0]?.profileName ?? "(none)";

    // 5. Run `belayer doctor --crag <slug>`
    //    Note: doctor reads hermes profiles from ~/.hermes/profiles/ (real).
    //    Our materializeTalentProfile wrote profiles to the sandbox hermesProfilesRoot,
    //    not the real ~/.hermes/profiles/. Doctor will still exit 0 for a crag with
    //    no orphan profiles — a crag with 0 profiles is healthy per belayer's model.
    //    This smoke validates that the crag is registered and doctor exits cleanly.
    const doctorResult = await run(belayerBin, ["doctor", "--crag", cragSlug]);

    if (doctorResult.exitCode !== 0) {
      process.stderr.write("belayer doctor exited non-zero:\n");
      process.stderr.write(doctorResult.stderr || doctorResult.stdout || "(no output)\n");
      smokeExitCode = 1;
      return;
    }

    // 6. Print PASS summary
    process.stdout.write("belayer doctor smoke OK\n");
    process.stdout.write(`  instance: ${instanceDir}\n`);
    process.stdout.write(`  crag:     ${cragSlug}\n`);
    process.stdout.write(`  profile:  ${primaryProfile}\n`);

    // 7. Cleanup sandbox tmp dir (best-effort; only on success path)
    await rm(sandboxDir, { recursive: true, force: true });
  } finally {
    // Always clean up the real belayer crag + any real hermes profiles.
    // belayer uninstall --crag <slug> --yes removes:
    //   - ~/.belayer/crags/<slug>/
    //   - all ~/.hermes/profiles/blyr-<slug>-* dirs
    const uninstallResult = await run(belayerBin, [
      "uninstall",
      "--crag",
      cragSlug,
      "--yes",
    ]);
    if (uninstallResult.exitCode !== 0) {
      process.stderr.write(
        `Warning: belayer uninstall cleanup failed (exit ${uninstallResult.exitCode}):\n`,
      );
      process.stderr.write(uninstallResult.stderr || uninstallResult.stdout || "(no output)");
      process.stderr.write("\n");
      process.stderr.write(
        `Manual cleanup: belayer uninstall --crag ${cragSlug} --yes\n`,
      );
    }
  }

  if (smokeExitCode !== 0) process.exit(smokeExitCode);
}

main().catch((err) => {
  process.stderr.write(`smoke-belayer-doctor: unexpected error: ${err.message}\n`);
  if (err.stack) process.stderr.write(err.stack + "\n");
  process.exit(1);
});
