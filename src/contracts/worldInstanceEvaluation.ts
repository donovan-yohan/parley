import { z } from "zod";
import { CharacterId, IsoDateTime, InstanceId, schemaVersion } from "./common.ts";

export const WorldInstanceEvaluationSchema = z
  .object({
    schema_version: schemaVersion("parley-world-instance-evaluation/v1"),
    story_id: z.string().min(1),
    world_instance_id: InstanceId,
    summary: z.string().min(1),
    notable_events: z.array(z.string()),
    npc_observations: z.array(
      z.object({
        actor_id: CharacterId,
        note: z.string().min(1),
      }),
    ),
    promotion_candidates: z.array(
      z.object({
        candidate_id: z.string().min(1),
        reason: z.string().min(1),
      }),
    ),
    evaluated_at: IsoDateTime,
  })
  .strict();

export type WorldInstanceEvaluation = z.infer<typeof WorldInstanceEvaluationSchema>;
