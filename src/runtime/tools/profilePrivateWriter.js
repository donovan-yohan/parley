/**
 * Write a private memory entry to the character's Belayer profile (MEMORY.md) via mail-to-self.
 * Every write MUST carry story_id (D5 cross-story scoping pin).
 *
 * @param {object} params
 * @param {string} params.cragSlug - Belayer crag slug for this Parley instance.
 * @param {string} params.characterId - Character's Belayer talent name.
 * @param {string} params.toolName - The tool that triggered this write.
 * @param {unknown} params.inputs - Tool inputs to persist.
 * @param {string} params.storyId - Required: cross-story scoping pin (D5 enforcement).
 * @param {{ mailSend: (args: object) => Promise<{ ok: boolean, messageId: string }> }} params.belayerProcess
 *   Injectable belayer process — { mailSend } — for testability.
 * @returns {Promise<{ ok: boolean, messageId: string }>}
 */
export async function writeProfilePrivate({
  cragSlug,
  characterId,
  toolName,
  inputs,
  storyId,
  belayerProcess
}) {
  if (!storyId) {
    throw new Error("writeProfilePrivate: story_id is required (D5 cross-story scoping pin)");
  }

  const memoryEntry = {
    schema_version: "parley-private-memory/v1",
    story_id: storyId,
    tool: toolName,
    inputs,
    written_at: new Date().toISOString()
  };

  const result = await belayerProcess.mailSend({
    cragSlug,
    talentName: characterId,
    body: JSON.stringify(memoryEntry),
    clientEventId: `private-${storyId}-${characterId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  });

  return { ok: result.ok, messageId: result.messageId };
}
