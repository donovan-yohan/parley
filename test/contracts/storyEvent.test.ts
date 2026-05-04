import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StoryEventSchema } from "../../src/contracts/storyEvent.ts";

const validEvent = {
  schema_version: "parley-story-event/v1",
  event_id: "evt-001",
  story_id: "story-alpha",
  type: "turn.committed",
  actor_id: "mara-underbough",
  tool: "commitTurn",
  inputs: { notes: "player moved north" },
  refs: { turn_id: "turn-0001" },
  emitted_at: "2026-05-04T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Positive: valid full event
// ---------------------------------------------------------------------------
describe("StoryEventSchema - valid", () => {
  it("accepts a fully populated valid event", () => {
    assert.ok(StoryEventSchema.safeParse(validEvent).success);
  });

  it("accepts a minimal event (only required fields)", () => {
    const minimal = {
      schema_version: "parley-story-event/v1",
      event_id: "evt-002",
      story_id: "story-beta",
      type: "npc.dormant",
      emitted_at: "2026-05-04T00:00:00Z",
    };
    assert.ok(StoryEventSchema.safeParse(minimal).success);
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown field rejected (strict mode)
// ---------------------------------------------------------------------------
describe("StoryEventSchema - unknown field", () => {
  it("rejects an object with an unknown field", () => {
    const result = StoryEventSchema.safeParse({
      ...validEvent,
      extra_field: "not allowed",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad emitted_at format
// ---------------------------------------------------------------------------
describe("StoryEventSchema - bad emitted_at format", () => {
  it("rejects a non-ISO emitted_at value", () => {
    const result = StoryEventSchema.safeParse({
      ...validEvent,
      emitted_at: "not-a-date",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: missing required type field
// ---------------------------------------------------------------------------
describe("StoryEventSchema - missing required type", () => {
  it("rejects an event missing the type field", () => {
    const { type: _omitted, ...withoutType } = validEvent;
    const result = StoryEventSchema.safeParse(withoutType);
    assert.equal(result.success, false);
  });
});
