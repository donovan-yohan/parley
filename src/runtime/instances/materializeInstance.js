/**
 * materializeInstance.js
 *
 * Materializes a full Parley instance directory from a world template.
 *
 * An instance consists of:
 *   - instances/<worldId>/<instanceId>/manifest.json
 *   - instances/<worldId>/<instanceId>/CRAG.yaml
 *   - instances/<worldId>/<instanceId>/world/characters/<characterId>.md  (copies)
 *   - Hermes talent profiles for each character (via materializeTalentProfile)
 *   - A Belayer crag initialized via `belayer crag init <instanceId>`
 */

import { mkdir, copyFile, readdir, writeFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { validateProfileNameBudget } from "./profileNameBudget.js";
import { materializeTalentProfile } from "./talentProfileMaterializer.js";

// ---------------------------------------------------------------------------
// Default subprocess wrapper
// ---------------------------------------------------------------------------

/**
 * Spawn a subprocess and resolve with { exitCode, stdout, stderr }.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
function defaultSpawn(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    const stdoutChunks = [];
    const stderrChunks = [];

    proc.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Directory copy helper
// ---------------------------------------------------------------------------

/**
 * Recursively copy a directory tree from src to dest.
 * @param {string} src
 * @param {string} dest
 * @param {{ skip?: Set<string> }} [opts]
 */
async function copyDir(src, dest, { skip = new Set() } = {}) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d, { skip });
    } else {
      await copyFile(s, d);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Materialize a full Parley instance from a world template.
 *
 * @param {object} opts
 * @param {string} opts.worldId               - World template identifier
 * @param {string} opts.instanceId            - Instance identifier (also used as cragSlug)
 * @param {string} opts.repoRoot              - Repository root path
 * @param {string} opts.hermesProfilesRoot    - Root directory for Hermes profiles
 * @param {string} [opts.belayerCli="belayer"] - Belayer binary name or path
 * @param {Function} [opts.spawnSubprocess]   - Injectable spawn for testing
 * @param {boolean} [opts.force=false]        - Overwrite existing instance if true
 *
 * @returns {Promise<{
 *   instanceDir: string,
 *   manifestPath: string,
 *   profiles: Array<{ characterId: string, profileName: string, profileDir: string, alreadyExists: boolean }>,
 *   artTalents: Array<{ talentName: string, profileName: string, profileDir: string, alreadyExists: boolean }>
 * }>}
 */
export async function materializeInstance({
  worldId,
  instanceId,
  repoRoot,
  hermesProfilesRoot,
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
  force = false,
}) {
  // 1. Validate required string inputs
  if (!worldId || typeof worldId !== "string") {
    throw new Error("worldId is required and must be a string");
  }
  if (!instanceId || typeof instanceId !== "string") {
    throw new Error("instanceId is required and must be a string");
  }
  if (!repoRoot || typeof repoRoot !== "string") {
    throw new Error("repoRoot is required and must be a string");
  }
  if (!hermesProfilesRoot || typeof hermesProfilesRoot !== "string") {
    throw new Error("hermesProfilesRoot is required and must be a string");
  }

  // 2. Verify world template exists
  const worldDir = path.join(repoRoot, "worlds", worldId);
  const worldExists = await stat(worldDir).then(() => true).catch(() => false);
  if (!worldExists) {
    throw new Error("world template not found: " + worldDir);
  }

  // 3. Compute instance dir
  const instanceDir = path.join(repoRoot, "instances", worldId, instanceId);

  // 4. No-clobber check
  if (!force) {
    const instanceExists = await stat(instanceDir).then(() => true).catch(() => false);
    if (instanceExists) {
      throw new Error(
        `instance already materialized: ${instanceDir}. Use --force to overwrite.`,
      );
    }
  }

  // 5. Read character templates from worlds/<worldId>/characters/*.md
  const charsTemplateDir = path.join(worldDir, "characters");
  const charFiles = await readdir(charsTemplateDir).catch((err) => {
    if (err.code === "ENOENT") return [];
    throw err;
  });
  const mdFiles = charFiles.filter((f) => f.endsWith(".md"));
  const characterIds = mdFiles.map((f) => path.basename(f, ".md"));

  // 6. Validate profile-name budget per character — collect all errors before failing
  const budgetErrors = [];
  for (const characterId of characterIds) {
    const result = validateProfileNameBudget(instanceId, characterId);
    if (!result.ok) {
      budgetErrors.push(
        ...result.errors.map((e) => `${characterId}: ${e.message}`),
      );
    }
  }
  if (budgetErrors.length > 0) {
    throw new Error(
      "profile name budget validation failed:\n" + budgetErrors.join("\n"),
    );
  }

  // 7-9. Wrap filesystem writes + spawn + profile materialization in a try/catch
  // so a failure leaves no partial state on disk. Without this, a failed
  // `belayer crag init` would leave instanceDir partially populated and the
  // no-clobber check at step 4 would block any retry without --force.
  const manifestPath = path.join(instanceDir, "manifest.json");
  const profiles = [];
  const artTalents = [];

  try {
    // 7. Copy full world template into instance/world/, skipping state/ (runtime-only)
    await copyDir(worldDir, path.join(instanceDir, "world"), { skip: new Set(["state"]) });

    // Write manifest.json
    const manifest = {
      schema_version: "parley-instance-manifest/v1",
      world_id: worldId,
      instance_id: instanceId,
      crag_slug: instanceId,
      created_at: new Date().toISOString(),
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

    // Write CRAG.yaml
    const cragYamlPath = path.join(instanceDir, "CRAG.yaml");
    await writeFile(cragYamlPath, `crag: ${instanceId}\n`, "utf8");

    // 8. Initialize the Belayer crag
    const spawnResult = await spawnSubprocess(belayerCli, ["crag", "init", instanceId]);
    if (spawnResult.exitCode !== 0) {
      throw new Error(
        `belayer crag init failed (exit ${spawnResult.exitCode}): ${spawnResult.stderr}`,
      );
    }

    // 9. Materialize each character's talent profile
    for (const characterId of characterIds) {
      const profileResult = await materializeTalentProfile({
        cragSlug: instanceId,
        talentName: characterId,
        memoryScope: "crag",
        hermesProfilesRoot,
        force,
      });
      profiles.push({
        characterId,
        profileName: profileResult.profileName,
        profileDir: profileResult.profileDir,
        alreadyExists: profileResult.alreadyExists,
      });
    }

    // Materialize art talents (PR #15) — these handle background + portrait image generation
    // via the Hermes image_generate tool through the Belayer wake transport.
    const ART_TALENTS = ["background-artist", "portrait-artist"];
    for (const talentName of ART_TALENTS) {
      const result = await materializeTalentProfile({
        cragSlug: instanceId,
        talentName,
        memoryScope: "crag",      // accumulate world-style preferences across stories
        hermesProfilesRoot,
        force,
      });
      artTalents.push({
        talentName,
        profileName: result.profileName,
        profileDir: result.profileDir,
        alreadyExists: result.alreadyExists,
      });
    }
  } catch (err) {
    // Clean up partial instance dir so retry doesn't get blocked by no-clobber.
    // Talent profile dirs that may have been created in step 9 are intentionally
    // NOT cleaned up here — they're idempotent on re-run via materializeTalentProfile.
    await rm(instanceDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  // 10. Return result
  return { instanceDir, manifestPath, profiles, artTalents };
}
