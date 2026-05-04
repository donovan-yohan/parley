import { z } from "zod";
import { CharacterId, IsoDateTime, TurnId, schemaVersion } from "./common.ts";

export const ScenePulseSchema = z
  .object({
    schema_version: schemaVersion("parley-scene-pulse/v1"),
    story_id: z.string().min(1),
    current_turn_id: TurnId,
    active_tensions: z.array(z.string()),
    visible_consequences: z.array(z.string()),
    current_leads: z.array(z.string()),
    npc_intentions: z.array(
      z.object({
        actor_id: CharacterId,
        intention: z.string().min(1),
      }),
    ),
    unresolved_threads: z.array(z.string()),
    awake_npcs: z.array(CharacterId),
    dormant_npcs: z.array(CharacterId),
    generated_at: IsoDateTime,
  })
  .strict();

export type ScenePulse = z.infer<typeof ScenePulseSchema>;
