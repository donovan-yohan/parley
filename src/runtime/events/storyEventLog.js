import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function appendStoryEvent({ instanceDir, storyId, event, validateEvent = null }) {
  if (validateEvent) validateEvent(event); // injected ZodSchema.parse
  const stateDir = path.join(instanceDir, storyId, "state");
  await mkdir(stateDir, { recursive: true });
  const eventsPath = path.join(stateDir, "events.jsonl");
  await appendFile(eventsPath, JSON.stringify(event) + "\n", "utf8");
  return { eventsPath };
}

export async function readStoryEvents({ instanceDir, storyId }) {
  const eventsPath = path.join(instanceDir, storyId, "state", "events.jsonl");
  const raw = await readFile(eventsPath, "utf8").catch(() => "");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
