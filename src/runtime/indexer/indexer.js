import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// Reads committed artifacts. NEVER writes anything. NEVER offers a write API.
// Boundary enforcement: this module exports query functions only.

export async function getNpcPrivateBeliefs({ hermesProfilesRoot, cragSlug, characterId, storyIdFilter = null }) {
  // Read profile MEMORY.md from <hermesProfilesRoot>/blyr-<crag>-<character>/MEMORY.md.
  // Memory entries written by profilePrivateWriter (PR #14) tag with story_id.
  // If storyIdFilter provided, return only entries for that story.
  const profileDir = path.join(hermesProfilesRoot, `blyr-${cragSlug}-${characterId}`);
  const memoryPath = path.join(profileDir, "MEMORY.md");
  const exists = await stat(memoryPath).then(() => true).catch(() => false);
  if (!exists) return [];
  const raw = await readFile(memoryPath, "utf8");
  // Best-effort parse of structured entries the writer placed there. Each entry
  // is JSON one per line OR Markdown blocks — we tolerate both.
  const beliefs = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (storyIdFilter && parsed.story_id !== storyIdFilter) continue;
        beliefs.push(parsed);
      } catch { /* skip malformed */ }
    }
  }
  return beliefs;
}

export async function getPublicEvents({ instanceDir, storyId, typeFilter = null }) {
  const eventsPath = path.join(instanceDir, storyId, "state", "events.jsonl");
  const raw = await readFile(eventsPath, "utf8").catch(() => "");
  const events = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  if (typeFilter) return events.filter((e) => e.type === typeFilter);
  return events;
}

export async function getPublicRumors({ instanceDir, storyId, mentions = null }) {
  // Filter events of type rumor.created, optionally filtering by .inputs.summary substring.
  const rumors = (await getPublicEvents({ instanceDir, storyId, typeFilter: "rumor.created" }));
  if (!mentions) return rumors;
  const needle = mentions.toLowerCase();
  return rumors.filter((e) => String(e.inputs?.summary ?? "").toLowerCase().includes(needle));
}

export async function getPromotionCandidates({ instanceDir, storyId }) {
  // Read world-instance-evaluation.json if present and return its promotion_candidates list.
  const evalPath = path.join(instanceDir, storyId, "world-instance-evaluation.json");
  const raw = await readFile(evalPath, "utf8").catch(() => null);
  if (!raw) return [];
  const eval_ = JSON.parse(raw);
  return eval_.promotion_candidates ?? [];
}

// HARD CONTRACT: this module exports NO write functions.
// Any agent attempting to mutate canon must go through Parley API (PR-D writers)
// or `parley promote-from-eval` (next module).
