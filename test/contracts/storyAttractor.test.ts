import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StoryAttractorSchema } from "../../src/contracts/storyAttractor.ts";

const validAttractor = {
  schema_version: "parley-story-attractor/v1",
  id: "attractor-001",
  story_instance_id: "instance-abc",
  priority: "high",
  intent: "Guide the hero to the tavern",
  acceptable_routes: ["take-the-road", "go-through-forest"],
  forbidden_shortcuts: ["teleport", "skip-dialogue"],
  success_signals: ["hero-enters-tavern", "innkeeper-greeted"],
};

// ---------------------------------------------------------------------------
// Positive: valid full attractor
// ---------------------------------------------------------------------------
describe("StoryAttractorSchema - valid", () => {
  it("accepts a valid full attractor", () => {
    assert.ok(StoryAttractorSchema.safeParse(validAttractor).success);
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown field rejected
// ---------------------------------------------------------------------------
describe("StoryAttractorSchema - unknown field", () => {
  it("rejects an object with an unknown field", () => {
    const result = StoryAttractorSchema.safeParse({
      ...validAttractor,
      extra_field: "not allowed",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: missing required field
// ---------------------------------------------------------------------------
describe("StoryAttractorSchema - missing required field", () => {
  it("rejects an attractor missing intent", () => {
    const { intent: _omitted, ...withoutIntent } = validAttractor;
    const result = StoryAttractorSchema.safeParse(withoutIntent);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: empty arrays
// ---------------------------------------------------------------------------
describe("StoryAttractorSchema - empty arrays", () => {
  it("rejects an empty acceptable_routes array", () => {
    const result = StoryAttractorSchema.safeParse({
      ...validAttractor,
      acceptable_routes: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects an empty forbidden_shortcuts array", () => {
    const result = StoryAttractorSchema.safeParse({
      ...validAttractor,
      forbidden_shortcuts: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects an empty success_signals array", () => {
    const result = StoryAttractorSchema.safeParse({
      ...validAttractor,
      success_signals: [],
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: wrong schema_version literal
// ---------------------------------------------------------------------------
describe("StoryAttractorSchema - wrong schema_version", () => {
  it("rejects a wrong schema_version string", () => {
    const result = StoryAttractorSchema.safeParse({
      ...validAttractor,
      schema_version: "parley-story-attractor/v2",
    });
    assert.equal(result.success, false);
  });
});
