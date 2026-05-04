/**
 * apply.ts — emits world-scoped CSS custom properties to the document.
 *
 * applyTheme(theme, worldId):
 *   1. Removes any prior <style data-world-theme="<worldId>"> block.
 *   2. Derives ~20 shadcn tokens from palette via color-mix() CSS literals.
 *   3. Applies colorOverrides on top of derived tokens.
 *   4. Emits componentStyles as --component-<bucket-kebab>-<prop-kebab> vars.
 *   5. Emits asset URLs as --world-asset-<key> vars.
 *   6. Emits typography vars (--font-sans, --font-mono, --font-display, etc.).
 *   7. Emits layout vars (--radius, --spacing-mul).
 *   8. Sets <html data-world-id="<worldId>" data-layout-variant="<variant>">.
 *   9. Injects the style block into document.head.
 *
 * buildCSSText(theme, worldId) is exported as a pure helper for tests —
 * it returns the raw CSS string without touching the DOM.
 */

import type { ParleyTheme } from "../../contracts/theme.ts";
import { deriveTokens } from "./tokens.ts";

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Convert camelCase to kebab-case. */
export function toKebab(str: string): string {
  return str.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);
}

/** Map density preset to a spacing multiplier string. */
function densityToSpacingMul(density?: string): string {
  switch (density) {
    case "compact":    return "0.85";
    case "spacious":   return "1.2";
    case "comfortable":
    default:           return "1";
  }
}

// ─── Pure CSS builder ─────────────────────────────────────────────────────────

/**
 * Build the full CSS text that scopes all theme tokens under
 * :root[data-world-id="<worldId>"]. No DOM access; safe to call in tests.
 */
export function buildCSSText(theme: ParleyTheme, worldId: string): string {
  const lines: string[] = [];

  // 1. Derived palette tokens
  const derived = deriveTokens(theme.palette);
  for (const [key, value] of Object.entries(derived)) {
    lines.push(`  ${key}: ${value};`);
  }

  // 2. colorOverrides — pin specific tokens
  if (theme.colorOverrides) {
    for (const [tokenName, colorValue] of Object.entries(theme.colorOverrides)) {
      // tokenName may or may not start with "--color-"; normalise.
      const varName = tokenName.startsWith("--") ? tokenName : `--color-${tokenName}`;
      lines.push(`  ${varName}: ${colorValue};`);
    }
  }

  // 3. Typography vars
  const t = theme.typography;
  lines.push(`  --font-sans: "${t.fontSans}";`);
  lines.push(`  --font-mono: "${t.fontMono}";`);
  if (t.fontDisplay) {
    lines.push(`  --font-display: "${t.fontDisplay}";`);
  }
  lines.push(`  --font-base-size: ${t.baseSize}px;`);
  if (t.lineHeight !== undefined) {
    lines.push(`  --font-line-height: ${t.lineHeight};`);
  }
  if (t.letterSpacing !== undefined) {
    lines.push(`  --font-letter-spacing: ${t.letterSpacing};`);
  }

  // 4. Layout vars
  const layout = theme.layout;
  if (layout?.radius !== undefined) {
    lines.push(`  --radius: ${layout.radius};`);
  }
  lines.push(`  --spacing-mul: ${densityToSpacingMul(layout?.density)};`);

  // 5. Asset vars
  const assets = theme.assets ?? {};
  for (const [key, value] of Object.entries(assets)) {
    if (value) {
      lines.push(`  --world-asset-${toKebab(key)}: url("${value}");`);
    }
  }

  // 6. componentStyles vars — camelCase bucket + camelCase prop → kebab vars
  const componentStyles = theme.componentStyles ?? {};
  for (const [bucket, props] of Object.entries(componentStyles)) {
    const bucketKebab = toKebab(bucket);
    for (const [prop, value] of Object.entries(props)) {
      const propKebab = toKebab(prop);
      lines.push(`  --component-${bucketKebab}-${propKebab}: ${value};`);
    }
  }

  const selector = `:root[data-world-id="${worldId}"]`;
  return `${selector} {\n${lines.join("\n")}\n}`;
}

// ─── DOM applicator ───────────────────────────────────────────────────────────

/**
 * Apply a parsed ParleyTheme to the live document for the given worldId.
 *
 * Idempotent: calling again with the same worldId replaces the prior style block.
 */
export function applyTheme(theme: ParleyTheme, worldId: string): void {
  // Remove any prior style tag for this world.
  const prior = document.querySelector(`style[data-world-theme="${worldId}"]`);
  prior?.remove();

  // Build and inject the new style block.
  const cssText = buildCSSText(theme, worldId);
  const style = document.createElement("style");
  style.setAttribute("data-world-theme", worldId);
  style.textContent = cssText;
  document.head.appendChild(style);

  // Set HTML-level data attributes for CSS and slot component keying.
  document.documentElement.setAttribute("data-world-id", worldId);
  if (theme.layoutVariant) {
    document.documentElement.setAttribute("data-layout-variant", theme.layoutVariant);
  } else {
    document.documentElement.removeAttribute("data-layout-variant");
  }

  // Load font if a fontUrl is provided.
  const fontUrl = theme.typography.fontUrl;
  if (fontUrl) {
    const linkId = `parley-font-${worldId}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = fontUrl;
      document.head.appendChild(link);
    }
  }
}
