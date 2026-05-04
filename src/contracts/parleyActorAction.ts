import { z } from "zod";
import {
  CharacterId,
  IsoDateTime,
  schemaVersion,
} from "./common.ts";

export const ParleyActorActionSchema = z
  .object({
    schema_version: schemaVersion("parley-actor-action/v1"),
    action_id: z.string().min(1),
    wake_id: z.string().min(1),
    story_id: z.string().min(1),
    actor_id: CharacterId,
    tool: z.string().min(1),
    inputs: z.record(z.string(), z.unknown()),
    emitted_at: IsoDateTime,
  })
  .strict();

export type ParleyActorAction = z.infer<typeof ParleyActorActionSchema>;
