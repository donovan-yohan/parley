import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DetourScene } from "../../src/contracts/detourScene.ts";

// ---------------------------------------------------------------------------
// Shared valid fixture
// ---------------------------------------------------------------------------
const validDetourScene = {
  schema_version: "parley-detour-scene/v1",
  id: "detour-001",
  source_turn_id: "turn-0001",
  scope: "story_instance",
  title: "The Hidden Passage",
  purpose: "Explore the underground network",
  target_attractor_ids: ["attractor-cave", "attractor-rebel-camp"],
  entry_state: { location: "tavern", time_of_day: "night" },
  exit_conditions: ["player reaches rebel camp", "player is captured"],
  expires_after: "3 turns",
  temporary_location: "underground-passage",
};

// ---------------------------------------------------------------------------
// Positive cases
// ---------------------------------------------------------------------------
describe("DetourScene - valid", () => {
  it("accepts a valid full detour scene", () => {
    assert.ok(DetourScene.safeParse(validDetourScene).success);
  });

  it("accepts a valid detour scene without optional temporary_location", () => {
    const { temporary_location: _, ...withoutOptional } = validDetourScene;
    assert.ok(DetourScene.safeParse(withoutOptional).success);
  });
});

// ---------------------------------------------------------------------------
// Negative cases — unknown / missing fields
// ---------------------------------------------------------------------------
describe("DetourScene - invalid", () => {
  it("rejects an object with an unknown field", () => {
    const result = DetourScene.safeParse({
      ...validDetourScene,
      unexpected_field: "should not be here",
    });
    assert.equal(result.success, false);
  });

  it("rejects an object missing entry_state", () => {
    const { entry_state: _, ...withoutEntryState } = validDetourScene;
    const result = DetourScene.safeParse(withoutEntryState);
    assert.equal(result.success, false);
  });

  it("rejects an empty target_attractor_ids array", () => {
    const result = DetourScene.safeParse({
      ...validDetourScene,
      target_attractor_ids: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects an empty exit_conditions array", () => {
    const result = DetourScene.safeParse({
      ...validDetourScene,
      exit_conditions: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects a bad scope value", () => {
    const result = DetourScene.safeParse({
      ...validDetourScene,
      scope: "world_canon",
    });
    assert.equal(result.success, false);
  });

  it("rejects a bad source_turn_id format", () => {
    const result = DetourScene.safeParse({
      ...validDetourScene,
      source_turn_id: "not-a-turn-id",
    });
    assert.equal(result.success, false);
  });

  it("rejects entry_state that is an array (must be plain object)", () => {
    const result = DetourScene.safeParse({
      ...validDetourScene,
      entry_state: ["location", "tavern"],
    });
    assert.equal(result.success, false);
  });
});
