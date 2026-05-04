import { z } from "zod";
import { TurnId, schemaVersion } from "./common.ts";

/**
 * Zod schema for the `parley-detour-scene/v1` contract.
 *
 * A detour scene represents a temporary narrative branch that can be entered
 * and exited based on specific conditions, scoped to a story instance.
 */
export const DetourScene = z
  .object({
    schema_version: schemaVersion("parley-detour-scene/v1"),
    id: z.string(),
    source_turn_id: TurnId,
    scope: z.enum(["story_instance"]),
    title: z.string(),
    purpose: z.string(),
    target_attractor_ids: z.array(z.string()).min(1),
    entry_state: z.record(z.string(), z.unknown()),
    exit_conditions: z.array(z.string()).min(1),
    expires_after: z.string(),
    temporary_location: z.string().optional(),
  })
  .strict();

export type DetourScene = z.infer<typeof DetourScene>;
