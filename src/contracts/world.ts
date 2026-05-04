import { z } from "zod";
import { WorldId, schemaVersion } from "./common.ts";

const SCHEMA_VERSION = "parley-world/v1" as const;

/**
 * Zod schema for world.json manifest files.
 * schema_version: parley-world/v1
 */
export const ParleyWorldSchema = z.object({
  schema_version: schemaVersion(SCHEMA_VERSION),

  /** Unique slug identifying the world (e.g. "last-lantern"). */
  id: WorldId,

  /** Human-readable display name. */
  name: z.string().min(1),

  /** One-sentence premise describing the world. */
  premise: z.string().min(1),

  /** Tonal descriptor (e.g. "grounded fantasy mystery"). */
  tone: z.string().min(1),

  /** List of scenario ids shipped with this world. */
  scenarios: z.array(z.string().min(1)),

  /** Optional relative path to cover image (e.g. "assets/cover.png"). */
  cover: z.string().optional(),

  /**
   * Shell mode:
   *   "default" — shell applies theme.yaml + optional stylesheet.css + slot components.
   *   "custom"  — world bundle owns the L2/L3 root render.
   * Defaults to "default" when omitted.
   */
  shell: z.enum(["default", "custom"]).default("default"),

  /**
   * Layout variant communicated to CSS via data-layout-variant attribute.
   * Common values: "cozy", "noir", "hud". Worlds may declare custom variants.
   */
  layoutVariant: z.string().optional(),

  /**
   * Path (relative to world root) to the YAML theme file.
   * Defaults to "theme.yaml" when omitted.
   */
  theme: z.string().default("theme.yaml"),

  /**
   * Path (relative to world root) to an optional CSS file.
   * No size cap for first-party worlds.
   */
  stylesheet: z.string().optional(),
});

export type ParleyWorld = z.infer<typeof ParleyWorldSchema>;

/** Parse and validate a world.json object, throwing on failure. */
export function parseParleyWorld(raw: unknown): ParleyWorld {
  return ParleyWorldSchema.parse(raw);
}
