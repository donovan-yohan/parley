import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ParleyWakeSchema } from "../../src/contracts/parleyWake.ts";

// ---------------------------------------------------------------------------
// Shared valid base object
// ---------------------------------------------------------------------------

const validWake = {
  schema_version: "parley-wake/v1",
  wake_id: "wake-abc123",
  crag_slug: "my-crag",
  actor_id: "hero-npc",
  scene_id: "tavern-scene",
  trigger: "player_action",
  current_story_context: {
    story_id: "story-001",
    scene_id: "tavern-scene",
    current_turn_id: "turn-0001",
    present_event_refs: ["evt-1", "evt-2"],
  },
} as const;

// ---------------------------------------------------------------------------
// Positive: valid full envelope
// ---------------------------------------------------------------------------

describe("ParleyWakeSchema — positive: valid full envelope", () => {
  it("accepts a minimal valid wake envelope", () => {
    const result = ParleyWakeSchema.safeParse(validWake);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts a wake with all optional fields", () => {
    const result = ParleyWakeSchema.safeParse({
      ...validWake,
      allowed_tools: ["narrate", "roll-dice"],
      relevant_event_refs: ["evt-3"],
      expected_response_within_ms: 5000,
    });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative: missing current_story_context
// ---------------------------------------------------------------------------

describe("ParleyWakeSchema — negative: missing current_story_context", () => {
  it("rejects when current_story_context is absent", () => {
    const { current_story_context: _csc, ...rest } = validWake;
    const result = ParleyWakeSchema.safeParse(rest);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: current_story_context missing story_id
// ---------------------------------------------------------------------------

describe("ParleyWakeSchema — negative: current_story_context missing story_id", () => {
  it("rejects when story_id is absent from current_story_context", () => {
    const result = ParleyWakeSchema.safeParse({
      ...validWake,
      current_story_context: {
        scene_id: "tavern-scene",
        current_turn_id: "turn-0001",
        present_event_refs: ["evt-1"],
      },
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: current_story_context missing present_event_refs
// ---------------------------------------------------------------------------

describe("ParleyWakeSchema — negative: current_story_context missing present_event_refs", () => {
  it("rejects when present_event_refs is absent from current_story_context", () => {
    const result = ParleyWakeSchema.safeParse({
      ...validWake,
      current_story_context: {
        story_id: "story-001",
        scene_id: "tavern-scene",
        current_turn_id: "turn-0001",
      },
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown top-level field rejected (.strict())
// ---------------------------------------------------------------------------

describe("ParleyWakeSchema — negative: unknown top-level field", () => {
  it("rejects an envelope with an extra unknown top-level field", () => {
    const result = ParleyWakeSchema.safeParse({
      ...validWake,
      unknown_field: "oops",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad actor_id format
// ---------------------------------------------------------------------------

describe("ParleyWakeSchema — negative: bad actor_id format", () => {
  it("rejects actor_id that starts with a capital letter", () => {
    const result = ParleyWakeSchema.safeParse({
      ...validWake,
      actor_id: "Hero-Npc",
    });
    assert.equal(result.success, false);
  });

  it("rejects actor_id that exceeds max length", () => {
    const result = ParleyWakeSchema.safeParse({
      ...validWake,
      actor_id: "a".repeat(33),
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad crag_slug format
// ---------------------------------------------------------------------------

describe("ParleyWakeSchema — negative: bad crag_slug format", () => {
  it("rejects crag_slug that starts with a hyphen", () => {
    const result = ParleyWakeSchema.safeParse({
      ...validWake,
      crag_slug: "-bad-slug",
    });
    assert.equal(result.success, false);
  });

  it("rejects crag_slug that exceeds max length of 25 chars", () => {
    const result = ParleyWakeSchema.safeParse({
      ...validWake,
      crag_slug: "a".repeat(26),
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: empty trigger string
// ---------------------------------------------------------------------------

describe("ParleyWakeSchema — negative: empty trigger string", () => {
  it("rejects an empty trigger string", () => {
    const result = ParleyWakeSchema.safeParse({
      ...validWake,
      trigger: "",
    });
    assert.equal(result.success, false);
  });
});
