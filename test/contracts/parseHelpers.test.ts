import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActionInterpretationSchema } from "../../src/contracts/actionInterpretation.ts";
import { safeParseWithFieldErrors } from "../../src/contracts/parseHelpers.ts";

// ---------------------------------------------------------------------------
// Shared valid base object
// ---------------------------------------------------------------------------

const validNormalContinuation = {
  schema_version: "parley-action-interpretation/v1",
  id: "action-123",
  turn_id: "turn-0001",
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
  turn_id: "turn-0002",
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
// Positive: valid value returns { ok: true, data } deep-equal to input
// ---------------------------------------------------------------------------

describe("safeParseWithFieldErrors — positive: valid value", () => {
  it("returns ok:true and data deep-equal to input for a valid object", () => {
    const result = safeParseWithFieldErrors(
      ActionInterpretationSchema,
      validNormalContinuation,
    );
    assert.ok(result.ok, `expected ok:true, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.deepEqual(result.data, validNormalContinuation);
    }
  });

  it("returns ok:true and data deep-equal to detour_scene input", () => {
    const result = safeParseWithFieldErrors(
      ActionInterpretationSchema,
      validDetourScene,
    );
    assert.ok(result.ok, `expected ok:true, got: ${JSON.stringify(result)}`);
    if (result.ok) {
      assert.deepEqual(result.data, validDetourScene);
    }
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown field returns { ok: false, errors } with unknown key path
// ---------------------------------------------------------------------------

describe("safeParseWithFieldErrors — negative: unknown field", () => {
  it("returns ok:false and an error message identifying the unknown key", () => {
    const result = safeParseWithFieldErrors(ActionInterpretationSchema, {
      ...validNormalContinuation,
      unexpected_field: "oops",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      // Zod's .strict() reports unrecognized_keys errors at root path (""),
      // embedding the key name in the message rather than the path.
      const messages = result.errors.map((e) => e.message);
      assert.ok(
        messages.some((m) => m.includes("unexpected_field")),
        `expected an error message mentioning "unexpected_field", got: ${JSON.stringify(result.errors)}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Negative: nested array index error path formats correctly
// ---------------------------------------------------------------------------

describe("safeParseWithFieldErrors — negative: nested array index path", () => {
  it("formats candidate_attractors.0 when first attractor entry is invalid", () => {
    // candidate_attractors must be non-empty strings; pass a non-string entry
    // to trigger an array-element type error at index 0
    const result = safeParseWithFieldErrors(ActionInterpretationSchema, {
      ...validDetourScene,
      candidate_attractors: [42, "attractor-b"],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      assert.ok(
        paths.some((p) => p === "candidate_attractors.0"),
        `expected path "candidate_attractors.0", got: ${JSON.stringify(paths)}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Negative: missing required root field returns error with field name in path
// ---------------------------------------------------------------------------

describe("safeParseWithFieldErrors — negative: missing required field", () => {
  it("returns an error whose path is the missing field name", () => {
    const { id: _id, ...withoutId } = validNormalContinuation;
    const result = safeParseWithFieldErrors(
      ActionInterpretationSchema,
      withoutId,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      assert.ok(
        paths.some((p) => p === "id"),
        `expected path "id", got: ${JSON.stringify(paths)}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Negative: bad enum value returns error with field path
// ---------------------------------------------------------------------------

describe("safeParseWithFieldErrors — negative: bad enum value", () => {
  it("returns an error at recommended_mode for an invalid enum value", () => {
    const result = safeParseWithFieldErrors(ActionInterpretationSchema, {
      ...validNormalContinuation,
      recommended_mode: "instant_win",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      assert.ok(
        paths.some((p) => p === "recommended_mode"),
        `expected path "recommended_mode", got: ${JSON.stringify(paths)}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Negative: root-level error (non-object input) → empty string path
// ---------------------------------------------------------------------------

describe("safeParseWithFieldErrors — negative: root-level error", () => {
  it("returns empty string path for a root-level type error", () => {
    const result = safeParseWithFieldErrors(ActionInterpretationSchema, null);
    assert.equal(result.ok, false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      assert.ok(
        paths.some((p) => p === ""),
        `expected empty-string path for root error, got: ${JSON.stringify(paths)}`,
      );
    }
  });
});
