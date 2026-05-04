import { z } from "zod";
import { schemaVersion } from "./common.ts";

const SCHEMA_VERSION = "parley-world-manifest/v1" as const;

/**
 * Per-world entry in the runtime manifest emitted by the build script.
 */
const WorldManifestEntrySchema = z.object({
  /** Whether the world uses the default Parley shell or ships a custom root bundle. */
  shell: z.enum(["default", "custom"]),

  /**
   * Hashed URL to the world's entry JS bundle under dist/.
   * Null for shell:"default" worlds with no slot components (theme-only worlds).
   */
  entryUrl: z.string().nullable(),

  /**
   * Optional SHA-384 subresource-integrity hash for the entry bundle.
   * Format: "sha384-<base64>".
   */
  integrity: z.string().optional(),
});

/**
 * Zod schema for the world-manifest.json emitted by scripts/discover-worlds.ts.
 * Fetched once at shell boot and cached in memory.
 */
export const WorldManifestSchema = z.object({
  schema_version: schemaVersion(SCHEMA_VERSION),

  /**
   * Map of world-id → entry descriptor.
   * Keys are world slugs (e.g. "last-lantern"); values describe how to load the world.
   */
  worlds: z.record(z.string(), WorldManifestEntrySchema),
});

export type WorldManifest = z.infer<typeof WorldManifestSchema>;
export type WorldManifestEntry = z.infer<typeof WorldManifestEntrySchema>;

/** Parse and validate a world-manifest.json object, throwing on failure. */
export function parseWorldManifest(raw: unknown): WorldManifest {
  return WorldManifestSchema.parse(raw);
}
