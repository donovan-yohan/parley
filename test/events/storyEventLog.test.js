import assert from "node:assert/strict";
import test, { describe, it } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  appendStoryEvent,
  readStoryEvents,
} from "../../src/runtime/events/storyEventLog.js";

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "parley-story-event-log-test-"));
}

function makeEvent(overrides = {}) {
  return {
    schema_version: "parley-story-event/v1",
    event_id: "evt-001",
    story_id: "story-alpha",
    type: "turn.committed",
    emitted_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// append → readStoryEvents returns the entry
// ---------------------------------------------------------------------------
describe("storyEventLog - append and read", () => {
  it("appended event is returned by readStoryEvents", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-alpha";
    const event = makeEvent({ event_id: "evt-001" });

    await appendStoryEvent({ instanceDir, storyId, event });
    const events = await readStoryEvents({ instanceDir, storyId });

    assert.equal(events.length, 1);
    assert.equal(events[0].event_id, "evt-001");
    assert.equal(events[0].type, "turn.committed");
  });
});

// ---------------------------------------------------------------------------
// Multiple appends preserved in order
// ---------------------------------------------------------------------------
describe("storyEventLog - multiple appends in order", () => {
  it("preserves insertion order across multiple appends", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-beta";

    await appendStoryEvent({ instanceDir, storyId, event: makeEvent({ event_id: "evt-001" }) });
    await appendStoryEvent({ instanceDir, storyId, event: makeEvent({ event_id: "evt-002" }) });
    await appendStoryEvent({ instanceDir, storyId, event: makeEvent({ event_id: "evt-003" }) });

    const events = await readStoryEvents({ instanceDir, storyId });
    assert.equal(events.length, 3);
    assert.equal(events[0].event_id, "evt-001");
    assert.equal(events[1].event_id, "evt-002");
    assert.equal(events[2].event_id, "evt-003");
  });
});

// ---------------------------------------------------------------------------
// Different storyIds are isolated
// ---------------------------------------------------------------------------
describe("storyEventLog - per-story isolation", () => {
  it("story A events do not appear in story B", async () => {
    const instanceDir = await makeTmpDir();

    await appendStoryEvent({
      instanceDir,
      storyId: "story-a",
      event: makeEvent({ event_id: "evt-a", story_id: "story-a" }),
    });
    await appendStoryEvent({
      instanceDir,
      storyId: "story-b",
      event: makeEvent({ event_id: "evt-b", story_id: "story-b" }),
    });

    const eventsA = await readStoryEvents({ instanceDir, storyId: "story-a" });
    const eventsB = await readStoryEvents({ instanceDir, storyId: "story-b" });

    assert.equal(eventsA.length, 1);
    assert.equal(eventsA[0].event_id, "evt-a");
    assert.equal(eventsB.length, 1);
    assert.equal(eventsB[0].event_id, "evt-b");
  });
});

// ---------------------------------------------------------------------------
// validateEvent injected → invalid event throws before write
// ---------------------------------------------------------------------------
describe("storyEventLog - validateEvent injection", () => {
  it("throws when validateEvent rejects the event, and nothing is written", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-gamma";
    const invalidEvent = { not_a_real_event: true };

    const validateEvent = (ev) => {
      if (!ev.event_id) throw new Error("Validation failed: missing event_id");
    };

    await assert.rejects(
      () => appendStoryEvent({ instanceDir, storyId, event: invalidEvent, validateEvent }),
      /Validation failed/,
    );

    // Nothing written — readStoryEvents should return empty
    const events = await readStoryEvents({ instanceDir, storyId });
    assert.equal(events.length, 0);
  });
});
