import { z } from "zod";
import { TurnId, schemaVersion } from "./common.ts";

const ReputationDelta = z
  .object({
    entity_id: z.string().min(1),
    axis: z.string().min(1),
    change: z.number(),
    reason: z.string().min(1),
  })
  .strict();

const RejectedClaim = z
  .object({
    id: z.string().min(1),
    claim: z.string().min(1),
    reason: z.string().min(1),
    handled: z.boolean(),
  })
  .strict();

export const StoryConsequenceSchema = z
  .object({
    schema_version: schemaVersion("parley-story-consequence/v1"),
    id: z.string(),
    source_turn_id: TurnId,
    category: z.string(),
    scope: z.enum(["story_instance"]),
    summary: z.string(),
    affected_entities: z.array(z.string()).min(1),
    promotion_eligible: z.boolean(),
    reputation_deltas: z.array(ReputationDelta).optional(),
    followup_hooks: z.array(z.string()).optional(),
    rejected_claims: z.array(RejectedClaim).optional(),
  })
  .strict();

export type StoryConsequence = z.infer<typeof StoryConsequenceSchema>;
