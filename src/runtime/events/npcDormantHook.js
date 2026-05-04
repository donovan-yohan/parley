import { stat, readdir } from "node:fs/promises";
import path from "node:path";
import { appendStoryEvent } from "./storyEventLog.js";

// Subscribes to Belayer talent-evaluation artifact appearance.
// For now: poll an artifacts dir; emit npc.dormant event into the active story when a new evaluation appears.
// The real Belayer event subscription wires up in PR #15 (cross-repo coordination flagged in C0 findings doc).

export async function emitNpcDormantEvent({
  instanceDir,
  storyId,
  characterId,
  evaluationArtifactPath,
  appendStoryEventFn = appendStoryEvent,
}) {
  const event = {
    schema_version: "parley-story-event/v1",
    event_id: `npc-dormant-${characterId}-${Date.now()}`,
    story_id: storyId,
    type: "npc.dormant",
    actor_id: characterId,
    refs: {
      talent_evaluation_path: evaluationArtifactPath,
    },
    emitted_at: new Date().toISOString(),
  };
  return appendStoryEventFn({ instanceDir, storyId, event });
}

export async function findNewTalentEvaluations({ artifactsDir, sinceTimestamp = null }) {
  // Returns list of evaluation artifact paths newer than sinceTimestamp.
  const exists = await stat(artifactsDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) return [];
  const files = await readdir(artifactsDir);
  const evaluations = files.filter(
    (f) => f.startsWith("talent-evaluation-") && f.endsWith(".json"),
  );
  return evaluations.map((f) => path.join(artifactsDir, f));
}
