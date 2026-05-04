import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { writeWorldInstanceEvaluation } from "../../src/runtime/events/worldInstanceEvaluationWriter.js";

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "parley-world-eval-test-"));
}

function makeEvaluation(overrides = {}) {
  return {
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Writes valid JSON to expected path
// ---------------------------------------------------------------------------
describe("worldInstanceEvaluationWriter - writes to disk", () => {
  it("writes valid JSON to <instanceDir>/<storyId>/world-instance-evaluation.json", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-alpha";
    const evaluation = makeEvaluation();

    const { evalPath } = await writeWorldInstanceEvaluation({
      instanceDir,
      storyId,
      evaluation,
    });

    const expectedPath = path.join(instanceDir, storyId, "world-instance-evaluation.json");
    assert.equal(evalPath, expectedPath);

    const raw = await readFile(evalPath, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.schema_version, "parley-world-instance-evaluation/v1");
    assert.equal(parsed.story_id, storyId);
    assert.equal(parsed.summary, evaluation.summary);
    assert.deepEqual(parsed.notable_events, evaluation.notable_events);
  });
});

// ---------------------------------------------------------------------------
// validateEvaluation injected catches malformed input
// ---------------------------------------------------------------------------
describe("worldInstanceEvaluationWriter - validateEvaluation injection", () => {
  it("throws when validateEvaluation rejects the evaluation", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-invalid";
    const malformed = { not_an_evaluation: true };

    const validateEvaluation = (ev) => {
      if (!ev.summary) throw new Error("Validation failed: missing summary");
    };

    await assert.rejects(
      () =>
        writeWorldInstanceEvaluation({
          instanceDir,
          storyId,
          evaluation: malformed,
          validateEvaluation,
        }),
      /Validation failed/,
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotent rewrite: second write with different content overwrites first
// ---------------------------------------------------------------------------
describe("worldInstanceEvaluationWriter - idempotent rewrite", () => {
  it("rewrites without error and second write wins", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-rewrite";

    const first = makeEvaluation({ summary: "First pass — preliminary observations." });
    const second = makeEvaluation({ summary: "Second pass — reviewed and corrected." });

    const r1 = await writeWorldInstanceEvaluation({ instanceDir, storyId, evaluation: first });
    const after1 = JSON.parse(await readFile(r1.evalPath, "utf8"));
    assert.equal(after1.summary, "First pass — preliminary observations.");

    const r2 = await writeWorldInstanceEvaluation({ instanceDir, storyId, evaluation: second });
    assert.equal(r2.evalPath, r1.evalPath, "second write should target same path");
    const after2 = JSON.parse(await readFile(r2.evalPath, "utf8"));
    assert.equal(after2.summary, "Second pass — reviewed and corrected.", "second write should overwrite first");
  });
});
