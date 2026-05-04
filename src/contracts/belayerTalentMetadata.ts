import { z } from "zod";
import { TalentName, CragSlug, IsoDateTime } from "./common.ts";

export const BelayerTalentMetadataSchema = z
  .object({
    profile_name: z
      .string()
      .regex(
        /^blyr-[a-z0-9][a-z0-9_-]{0,58}$/,
        "profile_name must start with blyr- and total <= 64 chars",
      ),
    talent_name: TalentName,
    crag_slug: CragSlug,
    /**
     * Load-bearing contract pin: "crag" scope is what makes resumable NPCs
     * survive across climbs. "session" is intentionally excluded from the enum.
     */
    memory_scope: z.enum(["climb", "crag", "talent"]),
    materialized_at: IsoDateTime,
  })
  .strict();

export type BelayerTalentMetadata = z.infer<typeof BelayerTalentMetadataSchema>;
