import { z } from "zod";
import {
  CragSlug,
  CharacterId,
  SceneId,
  TurnId,
  schemaVersion,
} from "./common.ts";

export const ParleyWakeSchema = z.object({
  schema_version: schemaVersion("parley-wake/v1"),
  wake_id: z.string().min(1),
  crag_slug: CragSlug,
  actor_id: CharacterId,
  scene_id: SceneId,
  trigger: z.string().min(1),
  current_story_context: z
    .object({
      story_id: z.string().min(1),
      scene_id: SceneId,
      current_turn_id: TurnId,
      present_event_refs: z.array(z.string().min(1)),
    })
    .strict(),
  allowed_tools: z.array(z.string().min(1)).optional(),
  relevant_event_refs: z.array(z.string().min(1)).optional(),
  expected_response_within_ms: z.number().int().positive().optional(),
}).strict();

export type ParleyWake = z.infer<typeof ParleyWakeSchema>;
