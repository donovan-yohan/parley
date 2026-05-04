import { z } from "zod";
import { schemaVersion } from "./common.ts";

export const StoryAttractorSchema = z
  .object({
    schema_version: schemaVersion("parley-story-attractor/v1"),
    id: z.string(),
    story_instance_id: z.string(),
    priority: z.string(),
    intent: z.string(),
    acceptable_routes: z.array(z.string()).min(1),
    forbidden_shortcuts: z.array(z.string()).min(1),
    success_signals: z.array(z.string()).min(1),
  })
  .strict();

export type StoryAttractor = z.infer<typeof StoryAttractorSchema>;
