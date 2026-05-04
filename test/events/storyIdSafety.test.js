import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { assertSafeStoryIdSegment } from "../../src/runtime/events/storyIdSafety.js";
import { appendStoryEvent, readStoryEvents } from "../../src/runtime/events/storyEventLog.js";
import { writeWorldInstanceEvaluation } from "../../src/runtime/events/worldInstanceEvaluationWriter.js";
import { writeInstancePublic } from "../../src/runtime/tools/instancePublicWriter.js";
import { buildScenePulse } from "../../src/runtime/events/pulseBuilder.js";

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "parley-story-id-safety-test-"));
}

// ---------------------------------------------------------------------------
// assertSafeStoryIdSegment — valid values
// ---------------------------------------------------------------------------
describe("storyIdSafety - accepts valid storyId values", () => {
  const valid = ["story-001", "last-lantern", "a", "Story_with_underscore"];

  for (const id of valid) {
    it(`accepts "${id}"`, () => {
      assert.doesNotThrow(() => assertSafeStoryIdSegment(id));
    });
  }
});

// ---------------------------------------------------------------------------
// assertSafeStoryIdSegment — rejected values
// ---------------------------------------------------------------------------
describe("storyIdSafety - rejects unsafe storyId values", () => {
  it("rejects empty string", () => {
    assert.throws(() => assertSafeStoryIdSegment(""), /non-empty/);
  });

  it("rejects '..'", () => {
    assert.throws(() => assertSafeStoryIdSegment(".."), /unsafe path/);
  });

  it("rejects 'a/b' (forward slash)", () => {
    assert.throws(() => assertSafeStoryIdSegment("a/b"), /unsafe path/);
  });

  it("rejects 'a\\\\b' (backslash)", () => {
    assert.throws(() => assertSafeStoryIdSegment("a\\b"), /unsafe path/);
  });

  it("rejects '.hidden' (leading dot)", () => {
    assert.throws(() => assertSafeStoryIdSegment(".hidden"), /must not start with/);
  });

  it("rejects 'path/../traversal' (contains ..)", () => {
    assert.throws(() => assertSafeStoryIdSegment("path/../traversal"), /unsafe path/);
  });
});

// ---------------------------------------------------------------------------
// Per-writer negative tests: path traversal is rejected
// ---------------------------------------------------------------------------
describe("storyIdSafety - appendStoryEvent rejects traversal storyId", () => {
  it("throws when storyId contains path traversal", async () => {
    const instanceDir = await makeTmpDir();
    const event = {
      schema_version: "parley-story-event/v1",
      event_id: "evt-001",
      story_id: "../outside",
      type: "turn.committed",
      emitted_at: new Date().toISOString(),
    };
    await assert.rejects(
      () => appendStoryEvent({ instanceDir, storyId: "../outside", event }),
      /unsafe path/,
    );
  });
});

describe("storyIdSafety - readStoryEvents rejects traversal storyId", () => {
  it("throws when storyId contains path traversal", async () => {
    const instanceDir = await makeTmpDir();
    await assert.rejects(
      () => readStoryEvents({ instanceDir, storyId: "../outside" }),
      /unsafe path/,
    );
  });
});

describe("storyIdSafety - writeInstancePublic rejects traversal storyId", () => {
  it("throws when storyId contains path traversal", async () => {
    const instanceDir = await makeTmpDir();
    await assert.rejects(
      () =>
        writeInstancePublic({
          instanceDir,
          storyId: "a/b",
          characterId: "mara-underbough",
          toolName: "speak",
          inputs: {},
        }),
      /unsafe path/,
    );
  });
});

describe("storyIdSafety - writeWorldInstanceEvaluation rejects traversal storyId", () => {
  it("throws when storyId contains path traversal", async () => {
    const instanceDir = await makeTmpDir();
    await assert.rejects(
      () =>
        writeWorldInstanceEvaluation({
          instanceDir,
          storyId: "../outside",
          evaluation: { summary: "test" },
        }),
      /unsafe path/,
    );
  });
});

describe("storyIdSafety - buildScenePulse rejects traversal storyId", () => {
  it("throws when storyId contains path traversal", async () => {
    const instanceDir = await makeTmpDir();
    await assert.rejects(
      () => buildScenePulse({ instanceDir, storyId: "../outside" }),
      /unsafe path/,
    );
  });
});
