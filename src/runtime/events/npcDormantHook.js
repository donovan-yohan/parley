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

/**
 * Returns evaluation artifact paths newer than `sinceTimestamp` (ms epoch or ISO string).
 * If `sinceTimestamp` is null/undefined, returns all matching artifacts.
 *
 * Filtering uses file mtime (not file content); a polling caller should pass
 * the timestamp of the prior poll to avoid re-emitting npc.dormant events.
 */
export async function findNewTalentEvaluations({ artifactsDir, sinceTimestamp = null }) {
  const exists = await stat(artifactsDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) return [];
  const files = await readdir(artifactsDir);
  const evaluations = files.filter(
    (f) => f.startsWith("talent-evaluation-") && f.endsWith(".json"),
  );
  const fullPaths = evaluations.map((f) => path.join(artifactsDir, f));

  if (sinceTimestamp == null) return fullPaths;

  const sinceMs = typeof sinceTimestamp === "number"
    ? sinceTimestamp
    : new Date(sinceTimestamp).getTime();
  if (Number.isNaN(sinceMs)) {
    throw new Error(`findNewTalentEvaluations: sinceTimestamp ${sinceTimestamp} is not a valid timestamp`);
  }

  const newer = [];
  for (const full of fullPaths) {
    const st = await stat(full).catch(() => null);
    if (st && st.mtimeMs > sinceMs) newer.push(full);
  }
  return newer;
}
