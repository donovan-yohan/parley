import { z } from "zod";
import {
  CragSlug,
  SceneId,
  TurnId,
  schemaVersion,
} from "./common.ts";

export const ParleyImageWakeSchema = z.object({
  schema_version: schemaVersion("parley-image-wake/v1"),
  wake_id: z.string().min(1),
  crag_slug: CragSlug,
  actor_id: z.enum(["background-artist", "portrait-artist"]),
  prompt: z.string().min(1),
  aspect_ratio: z.enum(["landscape", "portrait", "square"]),
  output_target: z.object({
    kind: z.enum(["portrait", "background"]),
    id: z.string().min(1),
  }).strict(),
  current_story_context: z.object({
    story_id: z.string().min(1),
    scene_id: SceneId,
    current_turn_id: TurnId,
    present_event_refs: z.array(z.string().min(1)),
  }).strict(),
}).strict();

export type ParleyImageWake = z.infer<typeof ParleyImageWakeSchema>;
