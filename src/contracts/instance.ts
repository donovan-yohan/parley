import { z } from "zod";
import {
  WorldId,
  CragSlug,
  InstanceId,
  IsoDateTime,
  schemaVersion,
} from "./common.ts";

export const ParleyInstanceManifestSchema = z
  .object({
    schema_version: schemaVersion("parley-instance-manifest/v1"),
    world_id: WorldId,
    instance_id: InstanceId,
    crag_slug: CragSlug,
    created_at: IsoDateTime,
    default_story_id: z.string().optional(),
  })
  .strict();

export type ParleyInstanceManifest = z.infer<typeof ParleyInstanceManifestSchema>;
