import { z } from "zod";

/**
 * Unique identifier for a conversation turn.
 * Format: turn-<4+ zero-padded decimal digits> (e.g. turn-0001)
 */
export const TurnId = z
  .string()
  .regex(/^turn-[0-9]{4,}$/, "TurnId must match turn-<digits4+>");

/**
 * ISO 8601 datetime string with timezone offset (Z or ±HH:MM).
 * Accepts strings like "2026-05-04T00:50:02Z" or "2026-05-04T00:50:02+05:30".
 */
export const IsoDateTime = z.string().datetime({ offset: true });

/**
 * Identifier for a world.
 * Lowercase alpha leading character, then [a-z0-9-], max 39 chars total.
 */
export const WorldId = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,38}$/,
    "WorldId: lowercase alpha leading, then [a-z0-9-], max 39 chars",
  );

/**
 * Identifier for a scene. Same constraints as WorldId.
 */
export const SceneId = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,38}$/,
    "SceneId: lowercase alpha leading, then [a-z0-9-], max 39 chars",
  );

/**
 * Identifier for a character.
 * Lowercase alpha leading character, then [a-z0-9-], max 32 chars total.
 */
export const CharacterId = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,31}$/,
    "CharacterId: lowercase alpha leading, then [a-z0-9-], max 32 chars",
  );

/**
 * Slug for a Belayer crag (profile-name segment).
 * Leading alphanumeric, then [a-z0-9_-], max 25 chars total.
 * Load-bearing pin: blyr-<crag(≤25)>-<talent(≤33)> must fit 64-char Hermes limit.
 */
export const CragSlug = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,24}$/,
    "CragSlug: leading alphanumeric, [a-z0-9_-], max 25 chars",
  );

/**
 * Name for a Belayer talent (profile-name segment).
 * Leading alphanumeric, then [a-z0-9_-], max 33 chars total.
 * Load-bearing pin: blyr-<crag(≤25)>-<talent(≤33)> must fit 64-char Hermes limit.
 */
export const TalentName = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,32}$/,
    "TalentName: leading alphanumeric, [a-z0-9_-], max 33 chars",
  );

/**
 * Unique identifier for a Parley instance.
 * Leading alphanumeric (a-z0-9), then [a-z0-9-], max 39 chars total.
 */
export const InstanceId = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{0,38}$/,
    "InstanceId: leading alphanumeric, [a-z0-9-], max 39 chars",
  );

/**
 * Helper for enforcing a schema_version literal field in contract schemas.
 * Using a generic ensures z.infer resolves to the literal type (e.g. "v1"),
 * not just string, so callers get precise type narrowing.
 *
 * @example
 * const MySchema = z.object({
 *   schema_version: schemaVersion("v1"),
 * });
 * type MySchema = z.infer<typeof MySchema>;
 * // MySchema["schema_version"] === "v1"  (literal, not string)
 */
export function schemaVersion<V extends string>(literal: V): z.ZodLiteral<V> {
  return z.literal(literal);
}

// Inferred TypeScript types for consumers
export type TurnId = z.infer<typeof TurnId>;
export type IsoDateTime = z.infer<typeof IsoDateTime>;
export type WorldId = z.infer<typeof WorldId>;
export type SceneId = z.infer<typeof SceneId>;
export type CharacterId = z.infer<typeof CharacterId>;
export type CragSlug = z.infer<typeof CragSlug>;
export type TalentName = z.infer<typeof TalentName>;
export type InstanceId = z.infer<typeof InstanceId>;
