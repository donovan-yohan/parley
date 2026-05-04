import { z } from "zod";
import { TurnId, SceneId, schemaVersion } from "./common.ts";

const SCHEMA_VERSION = "parley-action-interpretation/v1" as const;

export const UnsupportedClaim = z
  .object({
    id: z.string().min(1),
    claim: z.string().min(1),
    reason: z.string().min(1),
    handled: z.boolean(),
  })
  .strict();

/**
 * Base fields shared by all action interpretation objects.
 * The recommended_mode-conditional logic is enforced via superRefine below.
 */
const ActionInterpretationBase = z
  .object({
    schema_version: schemaVersion(SCHEMA_VERSION),
    id: z.string(),
    turn_id: TurnId,
    player_action: z.string(),
    scene_id: SceneId,
    intent: z.string(),
    plausibility: z.string(),
    cooperation: z.string(),
    claim_policy: z.string(),
    consequence_level: z.string(),
    recommended_mode: z.enum(["normal_continuation", "detour_scene"]),
    targets: z.array(z.string()).min(1),
    candidate_attractors: z.array(z.string()).optional(),
    unsupported_claims: z.array(UnsupportedClaim).optional(),
    guidance_id: z.string().optional(),
  })
  .strict();

/**
 * Zod schema for `parley-action-interpretation/v1`.
 *
 * When `recommended_mode` is `"detour_scene"`, `candidate_attractors` is
 * required to be a non-empty array. For `"normal_continuation"` it is
 * optional.
 */
export const ActionInterpretationSchema = ActionInterpretationBase.superRefine(
  (data, ctx) => {
    if (data.recommended_mode === "detour_scene") {
      if (
        !Array.isArray(data.candidate_attractors) ||
        data.candidate_attractors.length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidate_attractors"],
          message:
            "candidate_attractors must be a non-empty array when recommended_mode is detour_scene",
        });
      }
    }
  },
);

export type ActionInterpretation = z.infer<typeof ActionInterpretationSchema>;
