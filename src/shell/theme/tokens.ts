/**
 * tokens.ts — derives ~20 shadcn-style CSS custom properties from the
 * three-color palette (background, midground, foreground) via color-mix()
 * CSS literals. These are strings to be embedded into a <style> block;
 * no runtime color math is performed in JavaScript.
 */

export interface Palette {
  background: string;
  midground: string;
  foreground: string;
}

/**
 * Derive the full set of shadcn-compatible CSS custom property tokens from a
 * three-color palette. Returns a flat object keyed by CSS variable name
 * (including the leading "--").
 *
 * color-mix() is a CSS string literal here — it runs in the browser's style
 * engine, not in Node. Each derivation is documented below.
 */
export function deriveTokens(palette: Palette): Record<string, string> {
  const { background, midground, foreground } = palette;

  return {
    // ── Verbatim inputs ───────────────────────────────────────────────────────

    /** Deep background; maps to shadcn --background. */
    "--color-background": background,

    /** Primary text; maps to shadcn --foreground. */
    "--color-foreground": foreground,

    /** Mid-tone surface; not in shadcn but used across Parley components. */
    "--color-midground": midground,

    // ── Card ─────────────────────────────────────────────────────────────────

    /** Card background: bg lightened 15% toward midground. */
    "--color-card": `color-mix(in oklch, ${background} 85%, ${midground})`,

    /** Card foreground: foreground at full opacity. */
    "--color-card-foreground": foreground,

    // ── Popover ───────────────────────────────────────────────────────────────

    /** Popover background: bg lightened 20% toward midground. */
    "--color-popover": `color-mix(in oklch, ${background} 80%, ${midground})`,

    /** Popover foreground: foreground at full opacity. */
    "--color-popover-foreground": foreground,

    // ── Primary ───────────────────────────────────────────────────────────────

    /** Primary action color: midground lightened 30% toward foreground. */
    "--color-primary": `color-mix(in oklch, ${midground} 70%, ${foreground})`,

    /** Primary foreground: bg (high contrast on primary). */
    "--color-primary-foreground": background,

    // ── Secondary ─────────────────────────────────────────────────────────────

    /** Secondary surface: bg lightened 25% toward midground. */
    "--color-secondary": `color-mix(in oklch, ${background} 75%, ${midground})`,

    /** Secondary foreground: foreground tinted 20% toward midground. */
    "--color-secondary-foreground": `color-mix(in oklch, ${foreground} 80%, ${midground})`,

    // ── Muted ─────────────────────────────────────────────────────────────────

    /** Muted surface: bg lightened 30% toward midground. */
    "--color-muted": `color-mix(in oklch, ${background} 70%, ${midground})`,

    /** Muted foreground: foreground at 60% toward midground (subdued text). */
    "--color-muted-foreground": `color-mix(in oklch, ${foreground} 60%, ${midground})`,

    // ── Accent ────────────────────────────────────────────────────────────────

    /** Accent surface: midground lightened 40% toward foreground. */
    "--color-accent": `color-mix(in oklch, ${midground} 60%, ${foreground})`,

    /** Accent foreground: bg (high contrast on accent). */
    "--color-accent-foreground": background,

    // ── Destructive ───────────────────────────────────────────────────────────

    /**
     * Destructive: fixed warm-red that reads against most palette backgrounds.
     * Blended with midground so it stays in-palette rather than feeling alien.
     */
    "--color-destructive": `color-mix(in oklch, #ef4444 70%, ${midground})`,

    /** Destructive foreground: pure white for legibility. */
    "--color-destructive-foreground": "#ffffff",

    // ── Utility ───────────────────────────────────────────────────────────────

    /** Border: midground at 40% toward background (subtle lines). */
    "--color-border": `color-mix(in oklch, ${midground} 40%, ${background})`,

    /** Input: same as border (standard shadcn pattern). */
    "--color-input": `color-mix(in oklch, ${midground} 40%, ${background})`,

    /** Focus ring: primary (midground toward foreground). */
    "--color-ring": `color-mix(in oklch, ${midground} 70%, ${foreground})`,
  };
}
