/**
 * loadWorldTheme.ts — fetches, parses, validates, and applies a world's theme.
 *
 * Fetches /world-assets/theme.yaml?scenario=<worldId> (the existing static-asset
 * endpoint in server.js handles this path). Parses with the `yaml` library.
 * Validates via the ParleyThemeSchema Zod schema. Applies via applyTheme().
 *
 * Caches parsed themes in-memory by worldId; subsequent calls for the same
 * worldId skip the fetch + parse + apply and return the cached theme.
 *
 * On validation failure:
 *   - Logs a structured error to the console.
 *   - Falls back to a default (neutral) theme.
 *   - In development (import.meta.env.DEV or NODE_ENV != production),
 *     emits a non-blocking console banner.
 */

import { parse as parseYaml } from "yaml";
import type { ParleyTheme } from "../../contracts/theme.ts";
import { ParleyThemeSchema } from "../../contracts/theme.ts";
import { applyTheme } from "./apply.ts";

// ─── In-memory cache ─────────────────────────────────────────────────────────

const themeCache = new Map<string, ParleyTheme>();

// ─── Default fallback theme ───────────────────────────────────────────────────

/**
 * Neutral default Parley theme used when a world's theme.yaml fails
 * to load or validate.
 */
export const DEFAULT_THEME: ParleyTheme = {
  schema_version: "parley-theme/v1",
  palette: {
    background: "#0f0f0f",
    midground:  "#2a2a2a",
    foreground: "#e8e8e8",
  },
  typography: {
    fontSans: "system-ui, sans-serif",
    fontMono: "ui-monospace, monospace",
    baseSize: 15,
  },
};

// ─── isDev helper ─────────────────────────────────────────────────────────────

function isDev(): boolean {
  try {
    // Vite injects import.meta.env at build time; check it if available.
    return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Load, validate, and apply the theme for a world.
 *
 * @param worldId  The world slug (e.g. "last-lantern").
 * @returns The applied ParleyTheme (from cache or freshly fetched).
 */
export async function loadWorldTheme(worldId: string): Promise<ParleyTheme> {
  // Return cached theme if already loaded.
  const cached = themeCache.get(worldId);
  if (cached) {
    applyTheme(cached, worldId);
    return cached;
  }

  const url = `/world-assets/theme.yaml?scenario=${encodeURIComponent(worldId)}`;
  let theme: ParleyTheme;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    const text = await response.text();
    const raw = parseYaml(text);
    theme = ParleyThemeSchema.parse(raw);
  } catch (err) {
    const structured = {
      type: "THEME_LOAD_FAILURE",
      worldId,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
    console.error("[Parley] Theme load/validation failure:", structured);

    if (isDev()) {
      console.warn(
        `[Parley DEV] theme.yaml for world "${worldId}" failed validation; ` +
          "using default theme. Check the console error above."
      );
    }

    theme = DEFAULT_THEME;
  }

  themeCache.set(worldId, theme);
  applyTheme(theme, worldId);
  return theme;
}

/**
 * Clear the in-memory theme cache.
 * Intended for use in test teardown only — do not call in production code.
 */
export function __resetThemeCacheForTests(): void {
  themeCache.clear();
}
