import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeInstancePublic } from "../../src/runtime/tools/instancePublicWriter.js";

// ---------------------------------------------------------------------------
// Test fixture: temp directory per suite
// ---------------------------------------------------------------------------

let tmpDir = null;

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "parley-instance-public-test-"));
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe("writeInstancePublic — happy path", () => {
  it("creates events.jsonl when it does not exist and appends the entry", async () => {
    const instanceDir = path.join(tmpDir, "happy-1");
    const storyId = "story-001";

    const { eventsPath } = await writeInstancePublic({
      instanceDir,
      storyId,
      characterId: "innkeeper",
      toolName: "speak",
      inputs: { text: "Welcome, traveller." }
    });

    assert.ok(eventsPath.endsWith("events.jsonl"), `eventsPath should end with events.jsonl: ${eventsPath}`);
    assert.ok(eventsPath.includes(storyId), `eventsPath should include storyId`);

    const content = await readFile(eventsPath, "utf8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 1, "should have exactly one line");

    const event = JSON.parse(lines[0]);
    assert.equal(event.schema_version, "parley-story-event/v1");
    assert.equal(event.story_id, "story-001");
    assert.equal(event.actor_id, "innkeeper");
    assert.equal(event.tool, "speak");
    assert.deepEqual(event.inputs, { text: "Welcome, traveller." });
    assert.ok(typeof event.emitted_at === "string", "emitted_at should be a string");
  });

  it("appends a second entry without overwriting the first", async () => {
    const instanceDir = path.join(tmpDir, "happy-2");
    const storyId = "story-002";

    await writeInstancePublic({
      instanceDir,
      storyId,
      characterId: "guard",
      toolName: "emote",
      inputs: { action: "nods slowly" }
    });

    await writeInstancePublic({
      instanceDir,
      storyId,
      characterId: "guard",
      toolName: "speak",
      inputs: { text: "The gates are closed." }
    });

    const eventsPath = path.join(instanceDir, storyId, "state", "events.jsonl");
    const content = await readFile(eventsPath, "utf8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 2, "should have exactly two lines after two writes");

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);

    assert.equal(first.tool, "emote");
    assert.equal(second.tool, "speak");
  });

  it("each line in events.jsonl is parseable JSON", async () => {
    const instanceDir = path.join(tmpDir, "happy-3");
    const storyId = "story-003";

    for (const tool of ["speak", "emote", "move"]) {
      await writeInstancePublic({
        instanceDir,
        storyId,
        characterId: "merchant",
        toolName: tool,
        inputs: { value: tool }
      });
    }

    const eventsPath = path.join(instanceDir, storyId, "state", "events.jsonl");
    const content = await readFile(eventsPath, "utf8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 3);

    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `Each line must be valid JSON: ${line}`);
    }
  });

  it("creates intermediate directories if they do not exist", async () => {
    const instanceDir = path.join(tmpDir, "deep", "nested", "instance");
    const storyId = "story-deep";

    await assert.doesNotReject(() =>
      writeInstancePublic({
        instanceDir,
        storyId,
        characterId: "scout",
        toolName: "move",
        inputs: { destination: "forest" }
      })
    );

    const eventsPath = path.join(instanceDir, storyId, "state", "events.jsonl");
    const content = await readFile(eventsPath, "utf8");
    const event = JSON.parse(content.trim());
    assert.equal(event.actor_id, "scout");
  });

  it("returns the correct eventsPath", async () => {
    const instanceDir = path.join(tmpDir, "path-check");
    const storyId = "story-path";

    const { eventsPath } = await writeInstancePublic({
      instanceDir,
      storyId,
      characterId: "bard",
      toolName: "create_rumor",
      inputs: { rumor: "The king is ill." }
    });

    const expectedPath = path.join(instanceDir, storyId, "state", "events.jsonl");
    assert.equal(eventsPath, expectedPath);
  });
});
