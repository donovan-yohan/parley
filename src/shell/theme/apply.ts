/**
 * apply.ts — emits world-scoped CSS custom properties to the document.
 *
 * applyTheme(theme, worldId):
 *   1. Removes ALL prior <style data-world-theme> blocks (avoid DOM bloat
 *      across world switches).
 *   2. Derives ~20 shadcn tokens from palette via color-mix() CSS literals.
 *   3. Applies colorOverrides on top of derived tokens.
 *   4. Emits componentStyles as --component-<bucket-kebab>-<prop-kebab> vars.
 *   5. Emits asset URLs as --world-asset-<key> vars. Relative paths are
 *      resolved against the server's /world-assets/ route, scoped by ?scenario.
 *      Values are emitted as bare URL strings (no url() wrapper) so
 *      consumers can use them in either <img src> or background-image: url(var(...)).
 *   6. Emits typography vars (--font-sans, --font-mono, --font-display, etc.).
 *      Font-family values are emitted unquoted so theme authors can supply
 *      comma-separated stacks like "Inter, sans-serif".
 *   7. Emits layout vars (--radius, --spacing-mul).
 *   8. Sets <html data-world-id="<worldId>" data-layout-variant="<variant>">.
 *   9. Injects the style block into document.head.
 *  10. Reuses a single <link id="parley-active-font"> for the active world's
 *      font stylesheet (no per-world accumulation).
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

/**
 * Resolve an asset value from theme.yaml to a URL the browser can fetch.
 *
 * Absolute URLs (http(s):, data:, /-rooted) pass through unchanged.
 * Relative paths are routed through the server's /world-assets/ endpoint
 * scoped to the world's directory via ?scenario=<worldId>.
 */
function resolveAssetUrl(value: string, worldId: string): string {
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("/")
  ) {
    return value;
  }
  return `/world-assets/${value}?scenario=${encodeURIComponent(worldId)}`;
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

  // 3. Typography vars (no auto-quoting — themes can supply font stacks).
  const t = theme.typography;
  lines.push(`  --font-sans: ${t.fontSans};`);
  lines.push(`  --font-mono: ${t.fontMono};`);
  if (t.fontDisplay) {
    lines.push(`  --font-display: ${t.fontDisplay};`);
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

  // 5. Asset vars — emit bare URL strings; consumers wrap in url() if needed.
  const assets = theme.assets ?? {};
  for (const [key, value] of Object.entries(assets)) {
    if (value) {
      lines.push(`  --world-asset-${toKebab(key)}: ${resolveAssetUrl(value, worldId)};`);
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

const ACTIVE_FONT_LINK_ID = "parley-active-font";

/**
 * Apply a parsed ParleyTheme to the live document for the given worldId.
 *
 * Idempotent: every call removes prior world-theme style blocks and reuses
 * a single font link. Switching worlds does not accumulate DOM nodes.
 */
export function applyTheme(theme: ParleyTheme, worldId: string): void {
  // Remove any prior world-theme style blocks (from this or previous worlds).
  document.querySelectorAll("style[data-world-theme]").forEach((el) => el.remove());

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

  // Reuse a single <link> for the active font stylesheet.
  const fontUrl = theme.typography.fontUrl;
  let fontLink = document.getElementById(ACTIVE_FONT_LINK_ID) as HTMLLinkElement | null;
  if (fontUrl) {
    if (!fontLink) {
      fontLink = document.createElement("link");
      fontLink.id = ACTIVE_FONT_LINK_ID;
      fontLink.rel = "stylesheet";
      document.head.appendChild(fontLink);
    }
    if (fontLink.href !== fontUrl) {
      fontLink.href = fontUrl;
    }
  } else if (fontLink) {
    fontLink.remove();
  }
}

/**
 * Remove all theme-injected DOM state for the active world. Used when
 * returning to L1 (world-neutral chrome).
 */
export function clearAppliedTheme(): void {
  document.querySelectorAll("style[data-world-theme]").forEach((el) => el.remove());
  document.documentElement.removeAttribute("data-world-id");
  document.documentElement.removeAttribute("data-layout-variant");
  const fontLink = document.getElementById(ACTIVE_FONT_LINK_ID);
  fontLink?.remove();
}
