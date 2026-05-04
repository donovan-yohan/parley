import { z } from "zod";
import { schemaVersion } from "./common.ts";

const SCHEMA_VERSION = "parley-theme/v1" as const;

/**
 * Color value: hex (#rrggbb / #rgb) or rgba/rgb CSS string.
 * Kept as a loose string; palette authoring is validated structurally,
 * not by regex, so theme authors keep full CSS color flexibility.
 */
const ColorValue = z.string().min(1);

/**
 * Palette — the three-color foundation for the token cascade.
 * Additional optional palette keys (warmGlow, noiseOpacity) live outside
 * the required trio so the cascade can be invoked with just {background,
 * midground, foreground}.
 */
const PaletteSchema = z.object({
  /** Deep background color. */
  background: ColorValue,
  /** Mid-tone surface color for cards and panels. */
  midground: ColorValue,
  /** Primary text / foreground color. */
  foreground: ColorValue,
  /** Optional warm glow accent (rgba recommended). */
  warmGlow: ColorValue.optional(),
  /** Optional noise overlay opacity (0–1.2). */
  noiseOpacity: z.number().min(0).max(1.2).optional(),
});

/**
 * Typography — fonts and baseline metrics.
 */
const TypographySchema = z.object({
  /** Sans-serif body font family name. */
  fontSans: z.string().min(1),
  /** Monospace font family name. */
  fontMono: z.string().min(1),
  /** Optional display/heading font family name. */
  fontDisplay: z.string().optional(),
  /** Optional Google Fonts (or other) URL for @font-face loading. */
  fontUrl: z.string().optional(),
  /** Base font size in px (number only; unitless). */
  baseSize: z.number().positive(),
  /** Line height multiplier. */
  lineHeight: z.number().positive().optional(),
  /** Letter spacing CSS string (e.g. "0", "0.02em"). */
  letterSpacing: z.string().optional(),
});

/**
 * Layout — radius and density.
 */
const LayoutSchema = z.object({
  /** Border-radius CSS value (e.g. "0.25rem", "1rem", "0"). */
  radius: z.string().optional(),
  /** Spacing density preset. */
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
});

/**
 * Assets — well-known keys plus arbitrary custom entries.
 */
const AssetsSchema = z
  .object({
    /** Full-bleed scene background image path. */
    bg: z.string().optional(),
    /** Hero image path (used on L2 homebase). */
    hero: z.string().optional(),
    /** Small crest/logo image path (used in header slot). */
    crest: z.string().optional(),
    /** Sidebar decorative image path. */
    sidebar: z.string().optional(),
    /** Header decorative image path. */
    header: z.string().optional(),
  })
  .catchall(z.string());

/**
 * Component-style bucket: arbitrary camelCase CSS prop → string value.
 * Emitted as --component-<bucket-kebab>-<prop-kebab> custom properties.
 * Nested objects are rejected (v1 spec: flat only).
 */
const ComponentStyleBucket = z.record(z.string(), z.string());

/**
 * Top-level schema for parley-theme/v1.
 */
export const ParleyThemeSchema = z.object({
  schema_version: schemaVersion(SCHEMA_VERSION),

  /** Three-color palette foundation. */
  palette: PaletteSchema,

  /** Typography settings. */
  typography: TypographySchema,

  /** Layout metrics (radius, density). */
  layout: LayoutSchema.optional(),

  /**
   * Layout variant identifier surfaced as data-layout-variant on <html>.
   * Common: "cozy" | "noir" | "hud". Worlds may declare custom variants.
   */
  layoutVariant: z.string().optional(),

  /** Asset URL map. */
  assets: AssetsSchema.optional(),

  /**
   * Per-component style buckets.
   * Key: camelCase bucket name (e.g. "dialogueFrame").
   * Value: record of camelCase prop → CSS value string.
   */
  componentStyles: z.record(z.string(), ComponentStyleBucket).optional(),

  /**
   * Pin specific shadcn-style token names to exact color values,
   * overriding derivation (e.g. primary: "#c9a35c").
   */
  colorOverrides: z.record(z.string(), ColorValue).optional(),
});

export type ParleyTheme = z.infer<typeof ParleyThemeSchema>;
export type ParleyPalette = z.infer<typeof PaletteSchema>;

/** Parse and validate a theme YAML object, throwing on failure. */
export function parseParleyTheme(raw: unknown): ParleyTheme {
  return ParleyThemeSchema.parse(raw);
}
