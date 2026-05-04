import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActionInterpretationSchema } from "../../src/contracts/actionInterpretation.ts";

// ---------------------------------------------------------------------------
// Shared valid base objects
// ---------------------------------------------------------------------------

const validNormalContinuation = {
  schema_version: "parley-action-interpretation/v1",
  id: "action-123",
  turn_id: "turn-a1b2c3d4",
  player_action: "The player opens the door.",
  scene_id: "tavern-scene",
  intent: "explore",
  plausibility: "high",
  cooperation: "cooperative",
  claim_policy: "accept",
  consequence_level: "minor",
  recommended_mode: "normal_continuation",
  targets: ["innkeeper"],
} as const;

const validDetourScene = {
  schema_version: "parley-action-interpretation/v1",
  id: "action-456",
  turn_id: "turn-b2c3d4e5",
  player_action: "The player attacks the guard.",
  scene_id: "market-scene",
  intent: "combat",
  plausibility: "medium",
  cooperation: "antagonistic",
  claim_policy: "reject",
  consequence_level: "major",
  recommended_mode: "detour_scene",
  targets: ["guard", "bystander"],
  candidate_attractors: ["attractor-a", "attractor-b"],
} as const;

// ---------------------------------------------------------------------------
// Positive: valid normal_continuation (no candidate_attractors needed)
// ---------------------------------------------------------------------------

describe("ActionInterpretationSchema — positive: normal_continuation", () => {
  it("accepts a fully valid normal_continuation object", () => {
    const result = ActionInterpretationSchema.safeParse(validNormalContinuation);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts normal_continuation with optional unsupported_claims", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validNormalContinuation,
      unsupported_claims: ["claim-x"],
    });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts normal_continuation with optional guidance_id", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validNormalContinuation,
      guidance_id: "guide-001",
    });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts normal_continuation with optional candidate_attractors array present", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validNormalContinuation,
      candidate_attractors: ["attractor-x"],
    });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Positive: valid detour_scene (with candidate_attractors)
// ---------------------------------------------------------------------------

describe("ActionInterpretationSchema — positive: detour_scene", () => {
  it("accepts a fully valid detour_scene object", () => {
    const result = ActionInterpretationSchema.safeParse(validDetourScene);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts detour_scene with all optional fields", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validDetourScene,
      unsupported_claims: ["claim-y"],
      guidance_id: "guide-002",
    });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown field rejected (.strict() enforcement)
// ---------------------------------------------------------------------------

describe("ActionInterpretationSchema — negative: unknown field", () => {
  it("rejects an object with an extra unknown field", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validNormalContinuation,
      unexpected_field: "oops",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: missing required field
// ---------------------------------------------------------------------------

describe("ActionInterpretationSchema — negative: missing required field", () => {
  it("rejects when id is missing", () => {
    const { id: _id, ...rest } = validNormalContinuation;
    const result = ActionInterpretationSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects when player_action is missing", () => {
    const { player_action: _pa, ...rest } = validNormalContinuation;
    const result = ActionInterpretationSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects when intent is missing", () => {
    const { intent: _i, ...rest } = validNormalContinuation;
    const result = ActionInterpretationSchema.safeParse(rest);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: detour_scene without candidate_attractors
// ---------------------------------------------------------------------------

describe("ActionInterpretationSchema — negative: detour_scene without candidate_attractors", () => {
  it("rejects detour_scene when candidate_attractors is absent", () => {
    const { candidate_attractors: _ca, ...rest } = validDetourScene;
    const result = ActionInterpretationSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects detour_scene when candidate_attractors is an empty array", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validDetourScene,
      candidate_attractors: [],
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad recommended_mode value
// ---------------------------------------------------------------------------

describe("ActionInterpretationSchema — negative: bad recommended_mode", () => {
  it("rejects an unrecognised recommended_mode value", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validNormalContinuation,
      recommended_mode: "instant_win",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: empty targets array
// ---------------------------------------------------------------------------

describe("ActionInterpretationSchema — negative: empty targets", () => {
  it("rejects when targets is an empty array", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validNormalContinuation,
      targets: [],
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad turn_id format
// ---------------------------------------------------------------------------

describe("ActionInterpretationSchema — negative: bad turn_id format", () => {
  it("rejects a turn_id that does not match turn-<hex8+>", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validNormalContinuation,
      turn_id: "not-a-turn-id",
    });
    assert.equal(result.success, false);
  });

  it("rejects a turn_id with fewer than 8 hex chars", () => {
    const result = ActionInterpretationSchema.safeParse({
      ...validNormalContinuation,
      turn_id: "turn-abc",
    });
    assert.equal(result.success, false);
  });
});
