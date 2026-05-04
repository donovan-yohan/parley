import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StoryConsequenceSchema } from "../../src/contracts/storyConsequence.ts";

// Minimal valid object (required fields only)
const minimalValid = {
  schema_version: "parley-story-consequence/v1",
  id: "sc-001",
  source_turn_id: "turn-0001",
  category: "alliance",
  scope: "story_instance",
  summary: "The party saved the merchant.",
  affected_entities: ["merchant-aldric"],
  promotion_eligible: false,
};

// ---------------------------------------------------------------------------
// Positive cases
// ---------------------------------------------------------------------------
describe("StoryConsequenceSchema — positive", () => {
  it("accepts a minimal valid object (required fields only)", () => {
    assert.ok(StoryConsequenceSchema.safeParse(minimalValid).success);
  });

  it("accepts a full object with all optional fields including rejected_claims", () => {
    const full = {
      ...minimalValid,
      reputation_deltas: [
        { entity_id: "merchant-aldric", axis: "trust", change: 10, reason: "Party saved merchant" },
      ],
      followup_hooks: ["hook-rescue-followup"],
      rejected_claims: [
        { id: "rc-1", claim: "The merchant was ungrateful", reason: "Contradicts scene log", handled: true },
        { id: "rc-2", claim: "Party demanded payment", reason: "No evidence in transcript", handled: false },
      ],
      promotion_eligible: true,
    };
    assert.ok(StoryConsequenceSchema.safeParse(full).success);
  });
});

// ---------------------------------------------------------------------------
// Negative cases
// ---------------------------------------------------------------------------
describe("StoryConsequenceSchema — negative", () => {
  it("rejects an unknown field", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      extra_field: "not allowed",
    });
    assert.equal(result.success, false);
  });

  it("rejects when promotion_eligible is missing", () => {
    const { promotion_eligible: _, ...without } = minimalValid;
    const result = StoryConsequenceSchema.safeParse(without);
    assert.equal(result.success, false);
  });

  it("rejects when promotion_eligible is a string instead of boolean", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      promotion_eligible: "true",
    });
    assert.equal(result.success, false);
  });

  it("rejects an empty affected_entities array", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      affected_entities: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects a bad scope value", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      scope: "global_instance",
    });
    assert.equal(result.success, false);
  });

  it("rejects a bad source_turn_id format", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      source_turn_id: "not-a-turn-id",
    });
    assert.equal(result.success, false);
  });

  it("rejects a rejected_claims entry missing claim", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      rejected_claims: [{ reason: "some reason" }],
    });
    assert.equal(result.success, false);
  });

  it("rejects a rejected_claims entry missing reason", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      rejected_claims: [{ claim: "some claim" }],
    });
    assert.equal(result.success, false);
  });

  it("rejects a rejected_claims entry with empty-string claim", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      rejected_claims: [{ claim: "", reason: "some reason" }],
    });
    assert.equal(result.success, false);
  });

  it("rejects a rejected_claims entry missing id", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      rejected_claims: [{ claim: "some claim", reason: "some reason", handled: true }],
    });
    assert.equal(result.success, false);
  });

  it("rejects a rejected_claims entry missing handled", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      rejected_claims: [{ id: "rc-1", claim: "some claim", reason: "some reason" }],
    });
    assert.equal(result.success, false);
  });

  it("rejects a reputation_deltas entry that is a plain string", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      reputation_deltas: ["merchant-aldric:+10"],
    });
    assert.equal(result.success, false);
  });

  it("rejects a reputation_deltas entry missing change", () => {
    const result = StoryConsequenceSchema.safeParse({
      ...minimalValid,
      reputation_deltas: [{ entity_id: "merchant-aldric", axis: "trust", reason: "saved" }],
    });
    assert.equal(result.success, false);
  });
});
