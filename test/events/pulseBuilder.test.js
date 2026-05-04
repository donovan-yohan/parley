import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { buildScenePulse } from "../../src/runtime/events/pulseBuilder.js";
import { appendStoryEvent } from "../../src/runtime/events/storyEventLog.js";

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "parley-pulse-builder-test-"));
}

function baseEvent(type, overrides = {}) {
  return {
    schema_version: "parley-story-event/v1",
    event_id: `evt-${Date.now()}-${Math.random()}`,
    story_id: "story-alpha",
    type,
    emitted_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Empty events → pulse with empty arrays
// ---------------------------------------------------------------------------
describe("pulseBuilder - empty events", () => {
  it("returns pulse with empty arrays when no events exist", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-empty";

    const { pulse } = await buildScenePulse({ instanceDir, storyId });

    assert.equal(pulse.schema_version, "parley-scene-pulse/v1");
    assert.equal(pulse.story_id, storyId);
    assert.equal(pulse.current_turn_id, "turn-0000");
    assert.deepEqual(pulse.active_tensions, []);
    assert.deepEqual(pulse.visible_consequences, []);
    assert.deepEqual(pulse.current_leads, []);
    assert.deepEqual(pulse.npc_intentions, []);
    assert.deepEqual(pulse.unresolved_threads, []);
    assert.deepEqual(pulse.awake_npcs, []);
    assert.deepEqual(pulse.dormant_npcs, []);
  });
});

// ---------------------------------------------------------------------------
// Events with various types → pulse aggregates correctly
// ---------------------------------------------------------------------------
describe("pulseBuilder - event aggregation", () => {
  it("aggregates tension, consequence, lead, intention, unresolved, and turn events", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-agg";

    await appendStoryEvent({
      instanceDir,
      storyId,
      event: baseEvent("turn.committed", {
        story_id: storyId,
        refs: { turn_id: "turn-0002" },
      }),
    });
    await appendStoryEvent({
      instanceDir,
      storyId,
      event: baseEvent("tension.surfaced", {
        story_id: storyId,
        inputs: { summary: "the assassin is close" },
      }),
    });
    await appendStoryEvent({
      instanceDir,
      storyId,
      event: baseEvent("consequence.recorded", {
        story_id: storyId,
        inputs: { summary: "innkeeper fled" },
      }),
    });
    await appendStoryEvent({
      instanceDir,
      storyId,
      event: baseEvent("lead.surfaced", {
        story_id: storyId,
        inputs: { summary: "follow the coin" },
      }),
    });
    await appendStoryEvent({
      instanceDir,
      storyId,
      event: baseEvent("intention.set", {
        story_id: storyId,
        actor_id: "mara-underbough",
        inputs: { intention: "warn the hero" },
      }),
    });
    await appendStoryEvent({
      instanceDir,
      storyId,
      event: baseEvent("thread.unresolved", {
        story_id: storyId,
        inputs: { summary: "missing medallion" },
      }),
    });

    const { pulse } = await buildScenePulse({ instanceDir, storyId });

    assert.equal(pulse.current_turn_id, "turn-0002");
    assert.deepEqual(pulse.active_tensions, ["the assassin is close"]);
    assert.deepEqual(pulse.visible_consequences, ["innkeeper fled"]);
    assert.deepEqual(pulse.current_leads, ["follow the coin"]);
    assert.equal(pulse.npc_intentions.length, 1);
    assert.equal(pulse.npc_intentions[0].actor_id, "mara-underbough");
    assert.equal(pulse.npc_intentions[0].intention, "warn the hero");
    assert.deepEqual(pulse.unresolved_threads, ["missing medallion"]);
  });
});

// ---------------------------------------------------------------------------
// rosterFn injected → awake_npcs / dormant_npcs populated
// ---------------------------------------------------------------------------
describe("pulseBuilder - rosterFn injection", () => {
  it("populates awake_npcs and dormant_npcs from rosterFn", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-roster";

    const rosterFn = async () => ({
      awake: ["mara-underbough"],
      dormant: ["quinn-faro"],
    });

    const { pulse } = await buildScenePulse({ instanceDir, storyId, rosterFn });

    assert.deepEqual(pulse.awake_npcs, ["mara-underbough"]);
    assert.deepEqual(pulse.dormant_npcs, ["quinn-faro"]);
  });
});

// ---------------------------------------------------------------------------
// validatePulse injected → invalid pulse throws
// ---------------------------------------------------------------------------
describe("pulseBuilder - validatePulse injection", () => {
  it("throws when validatePulse rejects the pulse", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-validate";

    const validatePulse = (pulse) => {
      if (pulse.current_turn_id === "turn-0000") {
        throw new Error("Validation failed: no committed turn");
      }
    };

    await assert.rejects(
      () => buildScenePulse({ instanceDir, storyId, validatePulse }),
      /Validation failed/,
    );
  });
});

// ---------------------------------------------------------------------------
// pulse is written to disk at expected path
// ---------------------------------------------------------------------------
describe("pulseBuilder - file output", () => {
  it("writes scene-pulse.json to <instanceDir>/<storyId>/state/", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-disk";

    const { pulsePath, pulse } = await buildScenePulse({ instanceDir, storyId });

    const expectedPath = path.join(instanceDir, storyId, "state", "scene-pulse.json");
    assert.equal(pulsePath, expectedPath);

    const raw = await readFile(pulsePath, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.schema_version, "parley-scene-pulse/v1");
    assert.equal(parsed.story_id, storyId);
  });
});
