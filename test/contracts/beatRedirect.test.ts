import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BeatRedirectSchema } from "../../src/contracts/beatRedirect.ts";

const valid = {
  schema_version: "parley-beat-redirect/v1",
  id: "br-001",
  source_turn_id: "turn-a1b2c3d4",
  from_scene_id: "market-square",
  to_attractor_id: "tavern-entrance",
  route_type: "soft-redirect",
  summary: "The hero is nudged toward the tavern.",
  next_scene_suggestions: ["tavern-entrance", "side-alley"],
};

// ---------------------------------------------------------------------------
// Positive
// ---------------------------------------------------------------------------
describe("BeatRedirectSchema – valid", () => {
  it("accepts a fully valid beat redirect", () => {
    const result = BeatRedirectSchema.safeParse(valid);
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative – strict (unknown fields)
// ---------------------------------------------------------------------------
describe("BeatRedirectSchema – unknown field rejected", () => {
  it("rejects an object with an extra unknown field", () => {
    const result = BeatRedirectSchema.safeParse({ ...valid, extra_field: "oops" });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – missing required field
// ---------------------------------------------------------------------------
describe("BeatRedirectSchema – missing required field", () => {
  it("rejects when route_type is absent", () => {
    const { route_type, ...rest } = valid;
    const result = BeatRedirectSchema.safeParse(rest);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – empty next_scene_suggestions
// ---------------------------------------------------------------------------
describe("BeatRedirectSchema – empty next_scene_suggestions", () => {
  it("rejects an empty next_scene_suggestions array", () => {
    const result = BeatRedirectSchema.safeParse({ ...valid, next_scene_suggestions: [] });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – bad source_turn_id format
// ---------------------------------------------------------------------------
describe("BeatRedirectSchema – bad source_turn_id format", () => {
  it("rejects a source_turn_id without the turn- prefix", () => {
    const result = BeatRedirectSchema.safeParse({ ...valid, source_turn_id: "a1b2c3d4" });
    assert.equal(result.success, false);
  });

  it("rejects a source_turn_id with fewer than 8 hex chars", () => {
    const result = BeatRedirectSchema.safeParse({ ...valid, source_turn_id: "turn-abc123" });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – bad from_scene_id format
// ---------------------------------------------------------------------------
describe("BeatRedirectSchema – bad from_scene_id format", () => {
  it("rejects a from_scene_id that starts with a digit", () => {
    const result = BeatRedirectSchema.safeParse({ ...valid, from_scene_id: "1invalid" });
    assert.equal(result.success, false);
  });

  it("rejects a from_scene_id with uppercase letters", () => {
    const result = BeatRedirectSchema.safeParse({ ...valid, from_scene_id: "Market-Square" });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – wrong schema_version literal
// ---------------------------------------------------------------------------
describe("BeatRedirectSchema – wrong schema_version", () => {
  it("rejects a mismatched schema_version", () => {
    const result = BeatRedirectSchema.safeParse({ ...valid, schema_version: "parley-beat-redirect/v2" });
    assert.equal(result.success, false);
  });

  it("rejects a completely wrong schema_version", () => {
    const result = BeatRedirectSchema.safeParse({ ...valid, schema_version: "wrong" });
    assert.equal(result.success, false);
  });
});
