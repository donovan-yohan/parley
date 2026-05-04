import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ScenePulseSchema } from "../../src/contracts/scenePulse.ts";

const validPulse = {
  schema_version: "parley-scene-pulse/v1",
  story_id: "story-alpha",
  current_turn_id: "turn-0003",
  active_tensions: ["the-assassin-is-close", "betrayal-imminent"],
  visible_consequences: ["innkeeper-fled"],
  current_leads: ["follow-the-coin"],
  npc_intentions: [
    { actor_id: "mara-underbough", intention: "warn-the-hero" },
  ],
  unresolved_threads: ["missing-medallion"],
  awake_npcs: ["mara-underbough"],
  dormant_npcs: ["quinn-faro"],
  generated_at: "2026-05-04T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Positive: valid full pulse
// ---------------------------------------------------------------------------
describe("ScenePulseSchema - valid", () => {
  it("accepts a fully populated valid scene pulse", () => {
    assert.ok(ScenePulseSchema.safeParse(validPulse).success);
  });

  it("accepts a pulse with empty arrays", () => {
    const empty = {
      ...validPulse,
      active_tensions: [],
      visible_consequences: [],
      current_leads: [],
      npc_intentions: [],
      unresolved_threads: [],
      awake_npcs: [],
      dormant_npcs: [],
    };
    assert.ok(ScenePulseSchema.safeParse(empty).success);
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown field rejected (strict mode)
// ---------------------------------------------------------------------------
describe("ScenePulseSchema - unknown field", () => {
  it("rejects an object with an unknown field", () => {
    const result = ScenePulseSchema.safeParse({
      ...validPulse,
      extra_field: "not allowed",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad current_turn_id format
// ---------------------------------------------------------------------------
describe("ScenePulseSchema - bad current_turn_id format", () => {
  it("rejects a current_turn_id that does not match turn-<4+ digits>", () => {
    const result = ScenePulseSchema.safeParse({
      ...validPulse,
      current_turn_id: "turn-1",
    });
    assert.equal(result.success, false);
  });
});
