import { z } from "zod";
import { TurnId, SceneId, schemaVersion } from "./common.ts";

export const BeatRedirectSchema = z
  .object({
    schema_version: schemaVersion("parley-beat-redirect/v1"),
    id: z.string(),
    source_turn_id: TurnId,
    from_scene_id: SceneId,
    to_attractor_id: z.string(),
    route_type: z.string(),
    summary: z.string(),
    next_scene_suggestions: z.array(z.string()).min(1),
  })
  .strict();

export type BeatRedirect = z.infer<typeof BeatRedirectSchema>;
