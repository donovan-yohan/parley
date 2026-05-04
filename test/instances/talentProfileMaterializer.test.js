import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { materializeTalentProfile } from "../../src/runtime/instances/talentProfileMaterializer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "parley-test-"));
}

const BASE_ARGS = {
  cragSlug: "last-lantern-alpha",
  talentName: "mara-underbough",
  memoryScope: "crag",
};

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("happy path: fresh profile materializes correctly", async () => {
  const hermesProfilesRoot = await makeTmpDir();
  const result = await materializeTalentProfile({
    ...BASE_ARGS,
    hermesProfilesRoot,
  });

  assert.equal(result.profileName, "blyr-last-lantern-alpha-mara-underbough");
  assert.equal(result.alreadyExists, false);
  assert.ok(result.profileDir, "profileDir should be set");

  // File should exist
  const filePath = path.join(result.profileDir, ".belayer-talent.yaml");
  const fileStat = await stat(filePath);
  assert.ok(fileStat.isFile(), "yaml file should exist");

  // File contents should include all 5 fields
  const contents = await readFile(filePath, "utf8");
  assert.ok(contents.includes("profile_name:"), "should have profile_name field");
  assert.ok(contents.includes("talent_name:"), "should have talent_name field");
  assert.ok(contents.includes("crag_slug:"), "should have crag_slug field");
  assert.ok(contents.includes("memory_scope:"), "should have memory_scope field");
  assert.ok(contents.includes("materialized_at:"), "should have materialized_at field");
});

// ---------------------------------------------------------------------------
// Idempotent
// ---------------------------------------------------------------------------

test("idempotent: second call with same args returns alreadyExists: true", async () => {
  const hermesProfilesRoot = await makeTmpDir();
  const args = { ...BASE_ARGS, hermesProfilesRoot };

  const first = await materializeTalentProfile(args);
  assert.equal(first.alreadyExists, false);

  // Read original content
  const filePath = path.join(first.profileDir, ".belayer-talent.yaml");
  const originalContent = await readFile(filePath, "utf8");

  const second = await materializeTalentProfile(args);
  assert.equal(second.alreadyExists, true);
  assert.equal(second.profileDir, first.profileDir);
  assert.equal(second.profileName, first.profileName);

  // File should NOT have been rewritten
  const afterContent = await readFile(filePath, "utf8");
  assert.equal(afterContent, originalContent, "file content should be unchanged on second call");
});

// ---------------------------------------------------------------------------
// Force overwrite
// ---------------------------------------------------------------------------

test("force overwrite: force: true rewrites the file with new materialized_at", async (t) => {
  const hermesProfilesRoot = await makeTmpDir();
  const args = { ...BASE_ARGS, hermesProfilesRoot };

  const first = await materializeTalentProfile(args);
  const filePath = path.join(first.profileDir, ".belayer-talent.yaml");
  const firstContent = await readFile(filePath, "utf8");

  // Extract materialized_at from first write
  const firstAtLine = firstContent.split("\n").find((l) => l.startsWith("materialized_at:"));
  assert.ok(firstAtLine, "first write should have materialized_at");

  // Wait 2ms so Date.now() can differ (ISO strings are ms-precision)
  await new Promise((r) => setTimeout(r, 2));

  const second = await materializeTalentProfile({ ...args, force: true });
  assert.equal(second.alreadyExists, false);

  const secondContent = await readFile(filePath, "utf8");
  const secondAtLine = secondContent.split("\n").find((l) => l.startsWith("materialized_at:"));
  assert.ok(secondAtLine, "second write should have materialized_at");

  // materialized_at values should differ
  assert.notEqual(firstAtLine, secondAtLine, "force overwrite should produce new materialized_at");
});

// ---------------------------------------------------------------------------
// Invalid memory_scope (caller bug)
// ---------------------------------------------------------------------------

test("invalid memory_scope: throws when session is passed", async () => {
  const hermesProfilesRoot = await makeTmpDir();
  await assert.rejects(
    () =>
      materializeTalentProfile({
        ...BASE_ARGS,
        memoryScope: "session",
        hermesProfilesRoot,
      }),
    (err) => {
      assert.ok(err instanceof Error, "should throw an Error");
      assert.ok(
        err.message.includes("memory_scope"),
        `error message should mention memory_scope, got: ${err.message}`,
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Invalid budget
// ---------------------------------------------------------------------------

test("invalid budget: uppercase cragSlug throws invalid profile name budget error", async () => {
  const hermesProfilesRoot = await makeTmpDir();
  await assert.rejects(
    () =>
      materializeTalentProfile({
        cragSlug: "uppercase-Bad",
        talentName: "mara-underbough",
        memoryScope: "crag",
        hermesProfilesRoot,
      }),
    (err) => {
      assert.ok(err instanceof Error, "should throw an Error");
      assert.ok(
        err.message.startsWith("invalid profile name budget:"),
        `error message should start with 'invalid profile name budget:', got: ${err.message}`,
      );
      assert.ok(
        err.message.includes("cragSlug"),
        `error message should include 'cragSlug', got: ${err.message}`,
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Partial state: dir exists but yaml missing → completes materialization
// ---------------------------------------------------------------------------

test("partial state: dir exists without .belayer-talent.yaml → completes materialization", async () => {
  const hermesProfilesRoot = await makeTmpDir();
  const args = { ...BASE_ARGS, hermesProfilesRoot };

  // Simulate a prior run that died after mkdir but before file write
  const profileName = "blyr-last-lantern-alpha-mara-underbough";
  const profileDir = path.join(hermesProfilesRoot, profileName);
  await mkdir(profileDir, { recursive: true });
  // Do NOT write .belayer-talent.yaml

  // A second call without force should complete the materialization (not return alreadyExists: true)
  const result = await materializeTalentProfile(args);
  assert.equal(result.alreadyExists, false, "should not report alreadyExists when yaml was missing");
  assert.equal(result.profileDir, profileDir, "profileDir should match");

  // The yaml file should now exist
  const yamlPath = path.join(profileDir, ".belayer-talent.yaml");
  const yamlStat = await stat(yamlPath);
  assert.ok(yamlStat.isFile(), ".belayer-talent.yaml should exist after completing materialization");
});

// ---------------------------------------------------------------------------
// Round-trip integrity
// ---------------------------------------------------------------------------

test("round-trip integrity: all 5 fields present after write and parse", async () => {
  const hermesProfilesRoot = await makeTmpDir();
  const result = await materializeTalentProfile({
    ...BASE_ARGS,
    hermesProfilesRoot,
  });

  const filePath = path.join(result.profileDir, ".belayer-talent.yaml");
  const contents = await readFile(filePath, "utf8");

  // Inline flat YAML parser (same as in production code)
  function parseFlatYaml(content) {
    const obj = {};
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      obj[key] = value;
    }
    return obj;
  }

  const parsed = parseFlatYaml(contents);

  const REQUIRED_FIELDS = ["profile_name", "talent_name", "crag_slug", "memory_scope", "materialized_at"];
  for (const field of REQUIRED_FIELDS) {
    assert.ok(field in parsed, `parsed YAML should contain field: ${field}`);
    assert.ok(parsed[field].length > 0, `field ${field} should be non-empty`);
  }

  // Verify specific values
  assert.equal(parsed.profile_name, "blyr-last-lantern-alpha-mara-underbough");
  assert.equal(parsed.talent_name, "mara-underbough");
  assert.equal(parsed.crag_slug, "last-lantern-alpha");
  assert.equal(parsed.memory_scope, "crag");
  // materialized_at should be an ISO date string
  assert.ok(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(parsed.materialized_at),
    `materialized_at should look like an ISO date, got: ${parsed.materialized_at}`,
  );
});
