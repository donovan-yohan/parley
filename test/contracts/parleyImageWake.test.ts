import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ParleyImageWakeSchema } from "../../src/contracts/parleyImageWake.ts";

// ---------------------------------------------------------------------------
// Shared valid base object
// ---------------------------------------------------------------------------

const validImageWake = {
  schema_version: "parley-image-wake/v1",
  wake_id: "image-wake-abc123",
  crag_slug: "my-crag",
  actor_id: "background-artist",
  prompt: "A misty mountain valley at dawn",
  aspect_ratio: "landscape",
  output_target: {
    kind: "background",
    id: "mountain-valley-scene",
  },
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

describe("ParleyImageWakeSchema — positive: valid full envelope", () => {
  it("accepts a valid background-artist image wake envelope", () => {
    const result = ParleyImageWakeSchema.safeParse(validImageWake);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts a portrait-artist image wake envelope", () => {
    const result = ParleyImageWakeSchema.safeParse({
      ...validImageWake,
      actor_id: "portrait-artist",
      aspect_ratio: "portrait",
      output_target: { kind: "portrait", id: "hero-character" },
    });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts square aspect ratio", () => {
    const result = ParleyImageWakeSchema.safeParse({
      ...validImageWake,
      aspect_ratio: "square",
    });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative: missing current_story_context
// ---------------------------------------------------------------------------

describe("ParleyImageWakeSchema — negative: missing current_story_context", () => {
  it("rejects when current_story_context is absent", () => {
    const { current_story_context: _csc, ...rest } = validImageWake;
    const result = ParleyImageWakeSchema.safeParse(rest);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad actor_id enum
// ---------------------------------------------------------------------------

describe("ParleyImageWakeSchema — negative: bad actor_id enum", () => {
  it("rejects actor_id that is not background-artist or portrait-artist", () => {
    const result = ParleyImageWakeSchema.safeParse({
      ...validImageWake,
      actor_id: "hero-npc",
    });
    assert.equal(result.success, false);
  });

  it("rejects empty actor_id", () => {
    const result = ParleyImageWakeSchema.safeParse({
      ...validImageWake,
      actor_id: "",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad output_target.kind
// ---------------------------------------------------------------------------

describe("ParleyImageWakeSchema — negative: bad output_target.kind", () => {
  it("rejects output_target.kind that is not portrait or background", () => {
    const result = ParleyImageWakeSchema.safeParse({
      ...validImageWake,
      output_target: { kind: "scene", id: "some-scene" },
    });
    assert.equal(result.success, false);
  });

  it("rejects output_target with unknown extra field (.strict())", () => {
    const result = ParleyImageWakeSchema.safeParse({
      ...validImageWake,
      output_target: { kind: "background", id: "some-id", extra: "oops" },
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad aspect_ratio
// ---------------------------------------------------------------------------

describe("ParleyImageWakeSchema — negative: bad aspect_ratio", () => {
  it("rejects aspect_ratio not in enum", () => {
    const result = ParleyImageWakeSchema.safeParse({
      ...validImageWake,
      aspect_ratio: "widescreen",
    });
    assert.equal(result.success, false);
  });

  it("rejects numeric aspect_ratio", () => {
    const result = ParleyImageWakeSchema.safeParse({
      ...validImageWake,
      aspect_ratio: 1,
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown top-level field rejected (.strict())
// ---------------------------------------------------------------------------

describe("ParleyImageWakeSchema — negative: unknown top-level field", () => {
  it("rejects an envelope with an extra unknown top-level field", () => {
    const result = ParleyImageWakeSchema.safeParse({
      ...validImageWake,
      unknown_field: "oops",
    });
    assert.equal(result.success, false);
  });
});
