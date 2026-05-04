import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { materializeInstance } from "../../src/runtime/instances/materializeInstance.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "parley-materialize-test-"));
}

/**
 * Create a minimal world template structure in sandbox.
 * @param {string} repoRoot
 * @param {string} worldId
 * @param {string[]} characterIds  - e.g. ["mara-underbough", "quinn-faro"]
 */
async function scaffoldWorld(repoRoot, worldId, characterIds) {
  const worldDir = path.join(repoRoot, "worlds", worldId);
  const charsDir = path.join(worldDir, "characters");
  await mkdir(charsDir, { recursive: true });
  await writeFile(path.join(worldDir, "WORLD.md"), `# ${worldId} world\n`, "utf8");
  for (const characterId of characterIds) {
    await writeFile(
      path.join(charsDir, `${characterId}.md`),
      `# ${characterId}\n---\ncharacter: ${characterId}\n`,
      "utf8",
    );
  }
}

/**
 * Build a mock spawn that records calls and returns { exitCode: 0 } by default.
 * Override per call with exitCode/stderr if needed.
 */
function makeMockSpawn(overrides = {}) {
  const calls = [];
  const mockSpawn = async (cmd, args) => {
    calls.push([cmd, args]);
    const key = `${cmd} ${args.join(" ")}`;
    if (overrides[key]) return overrides[key];
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  mockSpawn.calls = calls;
  return mockSpawn;
}

const WORLD_ID = "last-lantern";
const INSTANCE_ID = "last-lantern-alpha";
const CHARACTERS = ["mara-underbough", "quinn-faro"];

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("happy path: materializeInstance succeeds with two characters", async () => {
  const repoRoot = await makeTmpDir();
  const hermesProfilesRoot = await makeTmpDir();
  await scaffoldWorld(repoRoot, WORLD_ID, CHARACTERS);

  const mockSpawn = makeMockSpawn();

  const result = await materializeInstance({
    worldId: WORLD_ID,
    instanceId: INSTANCE_ID,
    repoRoot,
    hermesProfilesRoot,
    spawnSubprocess: mockSpawn,
  });

  // mockSpawn was called once for belayer crag init
  assert.equal(mockSpawn.calls.length, 1, "should call spawn exactly once");
  const [spawnCmd, spawnArgs] = mockSpawn.calls[0];
  assert.equal(spawnCmd, "belayer", "should call belayer binary");
  assert.deepEqual(spawnArgs, ["crag", "init", INSTANCE_ID], "should pass crag init args");

  // manifest.json exists and has correct shape
  const instanceDir = path.join(repoRoot, "instances", WORLD_ID, INSTANCE_ID);
  assert.equal(result.instanceDir, instanceDir, "instanceDir path should match");

  const manifestPath = path.join(instanceDir, "manifest.json");
  assert.equal(result.manifestPath, manifestPath, "manifestPath should match");

  const manifestStat = await stat(manifestPath);
  assert.ok(manifestStat.isFile(), "manifest.json should exist");

  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.schema_version, "parley-instance-manifest/v1");
  assert.equal(manifest.world_id, WORLD_ID);
  assert.equal(manifest.instance_id, INSTANCE_ID);
  assert.equal(manifest.crag_slug, INSTANCE_ID);
  assert.ok(manifest.created_at, "created_at should be set");
  assert.ok(
    /^\d{4}-\d{2}-\d{2}T/.test(manifest.created_at),
    `created_at should be ISO format, got: ${manifest.created_at}`,
  );

  // world/characters copies exist
  const maraPath = path.join(instanceDir, "world", "characters", "mara-underbough.md");
  const maraStat = await stat(maraPath);
  assert.ok(maraStat.isFile(), "mara-underbough.md should be copied");

  const quinnPath = path.join(instanceDir, "world", "characters", "quinn-faro.md");
  const quinnStat = await stat(quinnPath);
  assert.ok(quinnStat.isFile(), "quinn-faro.md should be copied");

  // profiles returned for both characters
  assert.equal(result.profiles.length, 2, "should return 2 profiles");
  const charIds = result.profiles.map((p) => p.characterId).sort();
  assert.deepEqual(charIds, ["mara-underbough", "quinn-faro"].sort());

  // Hermes profile files exist for both characters
  for (const characterId of CHARACTERS) {
    const profileName = `blyr-${INSTANCE_ID}-${characterId}`;
    const profileDir = path.join(hermesProfilesRoot, profileName);
    const yamlPath = path.join(profileDir, ".belayer-talent.yaml");
    const yamlStat = await stat(yamlPath);
    assert.ok(yamlStat.isFile(), `.belayer-talent.yaml should exist for ${characterId}`);
  }
});

// ---------------------------------------------------------------------------
// No-clobber
// ---------------------------------------------------------------------------

test("no-clobber: second call without force throws 'already materialized' mentioning --force", async () => {
  const repoRoot = await makeTmpDir();
  const hermesProfilesRoot = await makeTmpDir();
  await scaffoldWorld(repoRoot, WORLD_ID, CHARACTERS);

  const mockSpawn = makeMockSpawn();

  // First call succeeds
  await materializeInstance({
    worldId: WORLD_ID,
    instanceId: INSTANCE_ID,
    repoRoot,
    hermesProfilesRoot,
    spawnSubprocess: mockSpawn,
  });

  // Second call should throw
  await assert.rejects(
    () =>
      materializeInstance({
        worldId: WORLD_ID,
        instanceId: INSTANCE_ID,
        repoRoot,
        hermesProfilesRoot,
        spawnSubprocess: mockSpawn,
      }),
    (err) => {
      assert.ok(err instanceof Error, "should throw an Error");
      assert.ok(
        err.message.includes("already materialized"),
        `error should mention 'already materialized', got: ${err.message}`,
      );
      assert.ok(
        err.message.includes("--force"),
        `error should mention '--force', got: ${err.message}`,
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Force overwrite
// ---------------------------------------------------------------------------

test("force overwrite: materialize twice with force: true succeeds", async () => {
  const repoRoot = await makeTmpDir();
  const hermesProfilesRoot = await makeTmpDir();
  await scaffoldWorld(repoRoot, WORLD_ID, CHARACTERS);

  const mockSpawn = makeMockSpawn();

  // First materialization
  await materializeInstance({
    worldId: WORLD_ID,
    instanceId: INSTANCE_ID,
    repoRoot,
    hermesProfilesRoot,
    spawnSubprocess: mockSpawn,
  });

  // Second with force should succeed
  const result = await materializeInstance({
    worldId: WORLD_ID,
    instanceId: INSTANCE_ID,
    repoRoot,
    hermesProfilesRoot,
    spawnSubprocess: mockSpawn,
    force: true,
  });

  assert.ok(result.instanceDir, "should return instanceDir on force re-run");
  assert.ok(Array.isArray(result.profiles), "should return profiles on force re-run");
});

// ---------------------------------------------------------------------------
// Missing world template
// ---------------------------------------------------------------------------

test("missing world template: throws 'world template not found'", async () => {
  const repoRoot = await makeTmpDir();
  const hermesProfilesRoot = await makeTmpDir();
  // Note: do NOT scaffold the world

  const mockSpawn = makeMockSpawn();

  await assert.rejects(
    () =>
      materializeInstance({
        worldId: "ghost-world",
        instanceId: INSTANCE_ID,
        repoRoot,
        hermesProfilesRoot,
        spawnSubprocess: mockSpawn,
      }),
    (err) => {
      assert.ok(err instanceof Error, "should throw an Error");
      assert.ok(
        err.message.includes("world template not found"),
        `error should mention 'world template not found', got: ${err.message}`,
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Belayer crag init failure
// ---------------------------------------------------------------------------

test("belayer crag init failure: non-zero exit throws with stderr", async () => {
  const repoRoot = await makeTmpDir();
  const hermesProfilesRoot = await makeTmpDir();
  await scaffoldWorld(repoRoot, WORLD_ID, CHARACTERS);

  const mockSpawn = makeMockSpawn({
    [`belayer crag init ${INSTANCE_ID}`]: { exitCode: 1, stdout: "", stderr: "crag exists" },
  });

  await assert.rejects(
    () =>
      materializeInstance({
        worldId: WORLD_ID,
        instanceId: INSTANCE_ID,
        repoRoot,
        hermesProfilesRoot,
        spawnSubprocess: mockSpawn,
      }),
    (err) => {
      assert.ok(err instanceof Error, "should throw an Error");
      assert.ok(
        err.message.includes("crag exists"),
        `error should include stderr 'crag exists', got: ${err.message}`,
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Profile budget failure — clean failure before fs writes
// ---------------------------------------------------------------------------

test("profile budget failure: long character name throws before filesystem writes", async () => {
  const repoRoot = await makeTmpDir();
  const hermesProfilesRoot = await makeTmpDir();
  const longCharId = "the-mysterious-stranger-with-a-very-long-name-that-is-too-long";
  await scaffoldWorld(repoRoot, WORLD_ID, [longCharId]);

  const mockSpawn = makeMockSpawn();

  await assert.rejects(
    () =>
      materializeInstance({
        worldId: WORLD_ID,
        instanceId: INSTANCE_ID,
        repoRoot,
        hermesProfilesRoot,
        spawnSubprocess: mockSpawn,
      }),
    (err) => {
      assert.ok(err instanceof Error, "should throw an Error");
      // Should mention budget/profile name issue
      assert.ok(
        err.message.length > 0,
        `error should have a message, got: ${err.message}`,
      );
      return true;
    },
  );

  // Verify no instance directory was created (clean failure)
  const instanceDir = path.join(repoRoot, "instances", WORLD_ID, INSTANCE_ID);
  const exists = await stat(instanceDir).then(() => true).catch(() => false);
  assert.equal(exists, false, "instance dir should NOT exist after budget failure");

  // Spawn should NOT have been called
  assert.equal(mockSpawn.calls.length, 0, "spawn should not be called before validation passes");
});

// ---------------------------------------------------------------------------
// Multi-character independence
// ---------------------------------------------------------------------------

test("multi-character: both profiles materialized; mockSpawn called once", async () => {
  const repoRoot = await makeTmpDir();
  const hermesProfilesRoot = await makeTmpDir();
  await scaffoldWorld(repoRoot, WORLD_ID, CHARACTERS);

  const mockSpawn = makeMockSpawn();

  const result = await materializeInstance({
    worldId: WORLD_ID,
    instanceId: INSTANCE_ID,
    repoRoot,
    hermesProfilesRoot,
    spawnSubprocess: mockSpawn,
  });

  // mockSpawn called exactly once (one crag init, not per character)
  assert.equal(mockSpawn.calls.length, 1, "spawn should be called exactly once (crag init only)");

  // Both profiles present
  assert.equal(result.profiles.length, 2, "both character profiles should be in result");

  // Both hermes profile dirs exist
  for (const characterId of CHARACTERS) {
    const profileName = `blyr-${INSTANCE_ID}-${characterId}`;
    const profileDir = path.join(hermesProfilesRoot, profileName);
    const exists = await stat(profileDir).then(() => true).catch(() => false);
    assert.ok(exists, `profile dir for ${characterId} should exist`);
  }
});
