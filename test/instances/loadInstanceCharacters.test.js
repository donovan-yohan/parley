import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadInstanceCharacters } from "../../src/runtime/instances/loadInstanceCharacters.js";
import { materializeInstance } from "../../src/runtime/instances/materializeInstance.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "parley-load-chars-test-"));
}

/**
 * Build a mock spawn that returns { exitCode: 0 }.
 */
function makeMockSpawn() {
  const calls = [];
  const mockSpawn = async (cmd, args) => {
    calls.push([cmd, args]);
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  mockSpawn.calls = calls;
  return mockSpawn;
}

/**
 * Create <sandbox>/world/characters/<id>.md with optional frontmatter.
 */
async function writeCharacterFile(sandboxDir, id, frontmatter, body = "") {
  const charsDir = path.join(sandboxDir, "world", "characters");
  await mkdir(charsDir, { recursive: true });
  let content;
  if (frontmatter) {
    const fmLines = Object.entries(frontmatter)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}: [${value.map((v) => `"${v}"`).join(", ")}]`;
        }
        return `${key}: ${value}`;
      })
      .join("\n");
    content = `---\n${fmLines}\n---\n${body}`;
  } else {
    content = body;
  }
  await writeFile(path.join(charsDir, `${id}.md`), content, "utf8");
}

// ---------------------------------------------------------------------------
// Happy path: 2 characters with frontmatter
// ---------------------------------------------------------------------------

test("happy path: loads 2 characters with correct ids and scene tag overlay", async () => {
  const sandbox = await makeTmpDir();

  await writeCharacterFile(sandbox, "foo-bar", {
    name: "Foo Bar",
    role: "merchant",
    faction: "trader-guild",
    lifecycle: "resumable",
    tags: ["location:market", "role:merchant"]
  });

  await writeCharacterFile(sandbox, "baz", {
    name: "Baz",
    role: "guard",
    tone: "stern"
  });

  const characters = await loadInstanceCharacters({
    instanceDir: sandbox,
    sceneId: "test-scene"
  });

  assert.equal(characters.length, 2, "should load 2 characters");

  const ids = characters.map((c) => c.id).sort();
  assert.deepEqual(ids, ["baz", "foo-bar"], "ids should match filenames");

  // Both characters should have scene tag
  for (const character of characters) {
    assert.ok(
      character.tags.includes("scene:test-scene"),
      `character ${character.id} should have scene:test-scene tag`
    );
  }

  const fooBar = characters.find((c) => c.id === "foo-bar");
  assert.ok(fooBar, "foo-bar character should exist");
  assert.equal(fooBar.name, "Foo Bar");
  assert.equal(fooBar.role, "merchant");
  assert.equal(fooBar.faction, "trader-guild");
  assert.ok(fooBar.tags.includes("location:market"), "should retain existing tags");
  assert.ok(fooBar.tags.includes("role:merchant"), "should retain role tag");
  assert.equal(fooBar.scene, "test-scene");
  assert.equal(fooBar.schema_version, "parley-character/v1");
  assert.equal(fooBar.reusable, true);
});

// ---------------------------------------------------------------------------
// Lifecycle defaults to "resumable" when frontmatter omits it
// ---------------------------------------------------------------------------

test("lifecycle defaults to 'resumable' when frontmatter omits it", async () => {
  const sandbox = await makeTmpDir();

  await writeCharacterFile(sandbox, "nameless-one", {
    name: "Nameless One",
    role: "wanderer"
    // no lifecycle field
  });

  const characters = await loadInstanceCharacters({
    instanceDir: sandbox,
    sceneId: "a-scene"
  });

  assert.equal(characters.length, 1);
  const character = characters[0];
  assert.equal(character.lifecycle, "resumable", "lifecycle should default to 'resumable'");
  assert.equal(character.belayerGeneratedTalent.lifecycle, "resumable");
});

// ---------------------------------------------------------------------------
// belayerGeneratedTalent shape
// ---------------------------------------------------------------------------

test("belayerGeneratedTalent has correct shape", async () => {
  const sandbox = await makeTmpDir();

  await writeCharacterFile(sandbox, "tavern-keeper", {
    name: "Tavern Keeper",
    role: "tavernkeep",
    faction: "staff",
    tone: "warm",
    importance: "recurring",
    knowledgeBoundary: "Knows local gossip only."
  });

  const characters = await loadInstanceCharacters({
    instanceDir: sandbox,
    sceneId: "tavern-scene"
  });

  assert.equal(characters.length, 1);
  const character = characters[0];
  const talent = character.belayerGeneratedTalent;

  assert.equal(talent.schema_version, "belayer-generated-talent/v1");
  assert.equal(talent.id, "tavern-keeper");
  assert.equal(talent.domain, "story");
  assert.equal(talent.role, "tavernkeep");
  assert.equal(talent.lifecycle, "resumable");
  assert.equal(talent.status, "generated");
  assert.equal(talent.source_request, "instance-load");
  assert.equal(talent.metadata.faction, "staff");
  assert.equal(talent.metadata.tone, "warm");
  assert.equal(talent.metadata.importance, "recurring");
  assert.equal(talent.metadata.knowledge_boundary, "Knows local gossip only.");
});

// ---------------------------------------------------------------------------
// Frontmatter-less file produces usable record with humanized name
// ---------------------------------------------------------------------------

test("frontmatter-less file produces a usable record with humanized name from filename", async () => {
  const sandbox = await makeTmpDir();

  // Write file with only markdown body, no frontmatter
  await writeCharacterFile(sandbox, "old-miller", null, "# Old Miller\n\nAn aged miller from the hills.\n");

  const characters = await loadInstanceCharacters({
    instanceDir: sandbox,
    sceneId: "village-scene"
  });

  assert.equal(characters.length, 1);
  const character = characters[0];

  assert.equal(character.id, "old-miller");
  assert.equal(character.name, "Old Miller", "name should be humanized from filename");
  assert.equal(character.role, "unspecified", "role should default to 'unspecified'");
  assert.equal(character.lifecycle, "resumable", "lifecycle should default to 'resumable'");
  assert.ok(character.tags.includes("scene:village-scene"), "should still have scene tag");
  assert.equal(character.schema_version, "parley-character/v1");
  assert.equal(character.reusable, true);
  assert.deepEqual(character.portrait, { status: "missing" });
});

// ---------------------------------------------------------------------------
// Missing characters dir returns empty array (don't throw)
// ---------------------------------------------------------------------------

test("missing characters dir returns empty array without throwing", async () => {
  const sandbox = await makeTmpDir();
  // Note: do NOT create the world/characters directory

  const characters = await loadInstanceCharacters({
    instanceDir: sandbox,
    sceneId: "any-scene"
  });

  assert.deepEqual(characters, [], "should return empty array when characters dir is missing");
});

// ---------------------------------------------------------------------------
// scene tag not duplicated if already present in frontmatter
// ---------------------------------------------------------------------------

test("scene tag is not duplicated when already present in frontmatter tags", async () => {
  const sandbox = await makeTmpDir();

  await writeCharacterFile(sandbox, "guard", {
    name: "Guard",
    role: "guard",
    tags: ["role:guard", "scene:the-gate"]
  });

  const characters = await loadInstanceCharacters({
    instanceDir: sandbox,
    sceneId: "the-gate"
  });

  assert.equal(characters.length, 1);
  const character = characters[0];
  const sceneTagCount = character.tags.filter((t) => t === "scene:the-gate").length;
  assert.equal(sceneTagCount, 1, "scene tag should appear exactly once");
});

// ---------------------------------------------------------------------------
// Integration smoke: real last-lantern world characters via materializeInstance
// ---------------------------------------------------------------------------

test("integration: loadInstanceCharacters works against real materialized last-lantern instance", async () => {
  // Use the real repo root (src/runtime/instances/ is under repoRoot/src/...)
  // We can import repoRoot from scenarioPacks.js
  const { repoRoot } = await import("../../src/runtime/scenarioPacks.js");

  const hermesProfilesRoot = await makeTmpDir();
  const mockSpawn = makeMockSpawn();

  const { instanceDir } = await materializeInstance({
    worldId: "last-lantern",
    instanceId: "last-lantern-test",
    repoRoot,
    hermesProfilesRoot,
    spawnSubprocess: mockSpawn,
    // force: true so repeated test runs don't fail on a stale instance directory
    force: true
  });

  const characters = await loadInstanceCharacters({
    instanceDir,
    sceneId: "last-lantern-tavern"
  });

  // last-lantern has exactly one character: mara-underbough
  assert.ok(characters.length >= 1, "should load at least 1 character from last-lantern");

  const mara = characters.find((c) => c.id === "mara-underbough");
  assert.ok(mara, "mara-underbough should be present");
  assert.ok(
    mara.tags.includes("scene:last-lantern-tavern"),
    "mara should have scene:last-lantern-tavern tag"
  );
  assert.equal(mara.schema_version, "parley-character/v1");
  assert.equal(mara.reusable, true);
  assert.equal(mara.belayerGeneratedTalent.schema_version, "belayer-generated-talent/v1");
  assert.equal(mara.belayerGeneratedTalent.source_request, "instance-load");
  assert.deepEqual(mara.portrait, { status: "missing" });
});
