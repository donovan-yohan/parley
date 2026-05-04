import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Append a structured event to instances/<world>/<instance>/<storyId>/state/events.jsonl.
 *
 * @param {object} params
 * @param {string} params.instanceDir - Absolute path to the instance directory.
 * @param {string} params.storyId - Story identifier (also used as subdirectory).
 * @param {string} params.characterId - ID of the character performing the action.
 * @param {string} params.toolName - Name of the tool that produced this event.
 * @param {unknown} params.inputs - Tool inputs to record.
 * @returns {Promise<{ eventsPath: string }>}
 */
export async function writeInstancePublic({
  instanceDir,
  storyId,
  characterId,
  toolName,
  inputs
}) {
  const stateDir = path.join(instanceDir, storyId, "state");
  await mkdir(stateDir, { recursive: true });

  const eventsPath = path.join(stateDir, "events.jsonl");

  const event = {
    schema_version: "parley-story-event/v1",
    story_id: storyId,
    actor_id: characterId,
    tool: toolName,
    inputs,
    emitted_at: new Date().toISOString()
  };

  await appendFile(eventsPath, JSON.stringify(event) + "\n", "utf8");

  return { eventsPath };
}
