import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ParleyActorActionSchema } from "../../src/contracts/parleyActorAction.ts";

// ---------------------------------------------------------------------------
// Shared valid base object
// ---------------------------------------------------------------------------

const validAction = {
  schema_version: "parley-actor-action/v1",
  action_id: "act-001",
  wake_id: "wake-abc123",
  story_id: "story-001",
  actor_id: "hero-npc",
  tool: "narrate",
  inputs: { text: "The hero steps forward." },
  emitted_at: "2026-05-04T00:50:02Z",
} as const;

// ---------------------------------------------------------------------------
// Positive: valid action
// ---------------------------------------------------------------------------

describe("ParleyActorActionSchema — positive: valid action", () => {
  it("accepts a fully valid actor action", () => {
    const result = ParleyActorActionSchema.safeParse(validAction);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts an action with complex inputs record", () => {
    const result = ParleyActorActionSchema.safeParse({
      ...validAction,
      inputs: {
        text: "Attack",
        target: "goblin",
        roll: 14,
        critical: false,
      },
    });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative: missing story_id (load-bearing)
// ---------------------------------------------------------------------------

describe("ParleyActorActionSchema — negative: missing story_id", () => {
  it("rejects when story_id is absent", () => {
    const { story_id: _sid, ...rest } = validAction;
    const result = ParleyActorActionSchema.safeParse(rest);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: missing inputs
// ---------------------------------------------------------------------------

describe("ParleyActorActionSchema — negative: missing inputs", () => {
  it("rejects when inputs is absent", () => {
    const { inputs: _inputs, ...rest } = validAction;
    const result = ParleyActorActionSchema.safeParse(rest);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad emitted_at format
// ---------------------------------------------------------------------------

describe("ParleyActorActionSchema — negative: bad emitted_at format", () => {
  it("rejects a non-ISO emitted_at string", () => {
    const result = ParleyActorActionSchema.safeParse({
      ...validAction,
      emitted_at: "not-a-date",
    });
    assert.equal(result.success, false);
  });

  it("rejects an ISO date without time component", () => {
    const result = ParleyActorActionSchema.safeParse({
      ...validAction,
      emitted_at: "2026-05-04",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown field rejected (.strict())
// ---------------------------------------------------------------------------

describe("ParleyActorActionSchema — negative: unknown field", () => {
  it("rejects an action with an extra unknown field", () => {
    const result = ParleyActorActionSchema.safeParse({
      ...validAction,
      unexpected_field: "oops",
    });
    assert.equal(result.success, false);
  });
});
