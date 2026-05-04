import { z } from "zod";
import { CharacterId, IsoDateTime, schemaVersion } from "./common.ts";

export const StoryEventSchema = z
  .object({
    schema_version: schemaVersion("parley-story-event/v1"),
    event_id: z.string().min(1),
    story_id: z.string().min(1),
    type: z.string().min(1), // "turn.committed" | "rumor.created" | "npc.dormant" | "wake.deferred" etc — open string for v1
    actor_id: CharacterId.optional(),
    tool: z.string().optional(),
    inputs: z.record(z.string(), z.unknown()).optional(),
    refs: z.record(z.string(), z.string()).optional(), // links to other artifacts (turn_id, talent_evaluation_path, etc.)
    emitted_at: IsoDateTime,
  })
  .strict();

export type StoryEvent = z.infer<typeof StoryEventSchema>;
