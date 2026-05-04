import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldInstanceEvaluationSchema } from "../../src/contracts/worldInstanceEvaluation.ts";

const validEvaluation = {
  schema_version: "parley-world-instance-evaluation/v1",
  story_id: "story-alpha",
  world_instance_id: "last-lantern-alpha",
  summary: "The heroes defeated the cult and restored the lantern.",
  notable_events: ["cult-defeated", "lantern-restored"],
  npc_observations: [
    { actor_id: "mara-underbough", note: "Showed unexpected courage at the gate." },
  ],
  promotion_candidates: [
    { candidate_id: "mara-underbough", reason: "Central to all three major plot resolutions." },
  ],
  evaluated_at: "2026-05-04T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Positive: valid full evaluation
// ---------------------------------------------------------------------------
describe("WorldInstanceEvaluationSchema - valid", () => {
  it("accepts a fully populated valid world instance evaluation", () => {
    assert.ok(WorldInstanceEvaluationSchema.safeParse(validEvaluation).success);
  });

  it("accepts a minimal evaluation with empty arrays", () => {
    const minimal = {
      ...validEvaluation,
      notable_events: [],
      npc_observations: [],
      promotion_candidates: [],
    };
    assert.ok(WorldInstanceEvaluationSchema.safeParse(minimal).success);
  });
});

// ---------------------------------------------------------------------------
// Negative: missing summary
// ---------------------------------------------------------------------------
describe("WorldInstanceEvaluationSchema - missing summary", () => {
  it("rejects an evaluation missing the summary field", () => {
    const { summary: _omitted, ...withoutSummary } = validEvaluation;
    const result = WorldInstanceEvaluationSchema.safeParse(withoutSummary);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: bad world_instance_id format
// ---------------------------------------------------------------------------
describe("WorldInstanceEvaluationSchema - bad world_instance_id format", () => {
  it("rejects a world_instance_id with an uppercase leading character", () => {
    const result = WorldInstanceEvaluationSchema.safeParse({
      ...validEvaluation,
      world_instance_id: "Bad-Instance-Id",
    });
    assert.equal(result.success, false);
  });
});
