import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  emitNpcDormantEvent,
  findNewTalentEvaluations,
} from "../../src/runtime/events/npcDormantHook.js";

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), "parley-npc-dormant-test-"));
}

// ---------------------------------------------------------------------------
// emitNpcDormantEvent produces correct event shape
// ---------------------------------------------------------------------------
describe("npcDormantHook - emitNpcDormantEvent event shape", () => {
  it("produces a well-formed npc.dormant event and calls appendStoryEventFn", async () => {
    const instanceDir = await makeTmpDir();
    const storyId = "story-alpha";
    const characterId = "mara-underbough";
    const evaluationArtifactPath = "/path/to/talent-evaluation-mara.json";

    const calls = [];
    const appendStoryEventFn = async (args) => {
      calls.push(args);
      return { eventsPath: path.join(instanceDir, storyId, "state", "events.jsonl") };
    };

    await emitNpcDormantEvent({
      instanceDir,
      storyId,
      characterId,
      evaluationArtifactPath,
      appendStoryEventFn,
    });

    assert.equal(calls.length, 1);
    const { instanceDir: calledDir, storyId: calledStory, event } = calls[0];
    assert.equal(calledDir, instanceDir);
    assert.equal(calledStory, storyId);
    assert.equal(event.schema_version, "parley-story-event/v1");
    assert.equal(event.story_id, storyId);
    assert.equal(event.type, "npc.dormant");
    assert.equal(event.actor_id, characterId);
    assert.equal(event.refs.talent_evaluation_path, evaluationArtifactPath);
    assert.ok(event.event_id.startsWith(`npc-dormant-${characterId}-`));
    assert.ok(typeof event.emitted_at === "string" && event.emitted_at.length > 0);
  });
});

// ---------------------------------------------------------------------------
// findNewTalentEvaluations returns empty list when artifacts dir missing
// ---------------------------------------------------------------------------
describe("npcDormantHook - findNewTalentEvaluations missing dir", () => {
  it("returns empty array when artifactsDir does not exist", async () => {
    const result = await findNewTalentEvaluations({
      artifactsDir: "/nonexistent-path-that-does-not-exist/artifacts",
    });
    assert.deepEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// findNewTalentEvaluations finds files matching talent-evaluation-*.json
// ---------------------------------------------------------------------------
describe("npcDormantHook - findNewTalentEvaluations pattern matching", () => {
  it("returns paths for talent-evaluation-*.json files and ignores non-matching files", async () => {
    const tmpDir = await makeTmpDir();
    const artifactsDir = path.join(tmpDir, "artifacts");
    await mkdir(artifactsDir, { recursive: true });

    // Matching files
    await writeFile(path.join(artifactsDir, "talent-evaluation-mara.json"), "{}", "utf8");
    await writeFile(path.join(artifactsDir, "talent-evaluation-quinn.json"), "{}", "utf8");
    // Non-matching files
    await writeFile(path.join(artifactsDir, "other-artifact.json"), "{}", "utf8");
    await writeFile(path.join(artifactsDir, "talent-evaluation-mara.txt"), "", "utf8");

    const results = await findNewTalentEvaluations({ artifactsDir });

    assert.equal(results.length, 2);
    const basenames = results.map((p) => path.basename(p));
    assert.ok(basenames.includes("talent-evaluation-mara.json"));
    assert.ok(basenames.includes("talent-evaluation-quinn.json"));
    // Verify full paths
    for (const r of results) {
      assert.ok(r.startsWith(artifactsDir));
    }
  });
});
