import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Append a structured event to instances/<world>/<instance>/<storyId>/state/events.jsonl.
 *
 * Event shape matches parley-story-event/v1 (event_id + type required) so the
 * file remains consistent with events written via storyEventLog.appendStoryEvent.
 *
 * @param {object} params
 * @param {string} params.instanceDir - Absolute path to the instance directory.
 * @param {string} params.storyId - Story identifier (also used as subdirectory).
 * @param {string} params.characterId - ID of the character performing the action.
 * @param {string} params.toolName - Name of the tool that produced this event.
 * @param {unknown} params.inputs - Tool inputs to record.
 * @param {Function} [params.validateEvent] - Optional StoryEventSchema.parse injection.
 * @returns {Promise<{ eventsPath: string, eventId: string }>}
 */
export async function writeInstancePublic({
  instanceDir,
  storyId,
  characterId,
  toolName,
  inputs,
  validateEvent = null
}) {
  const stateDir = path.join(instanceDir, storyId, "state");
  await mkdir(stateDir, { recursive: true });

  const eventsPath = path.join(stateDir, "events.jsonl");

  const eventId = `tool-${toolName}-${storyId}-${characterId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const event = {
    schema_version: "parley-story-event/v1",
    event_id: eventId,
    story_id: storyId,
    type: `tool.${toolName}`,
    actor_id: characterId,
    tool: toolName,
    inputs,
    emitted_at: new Date().toISOString()
  };

  if (validateEvent) validateEvent(event);

  await appendFile(eventsPath, JSON.stringify(event) + "\n", "utf8");

  return { eventsPath, eventId };
}
