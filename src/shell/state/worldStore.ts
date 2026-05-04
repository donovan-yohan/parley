/**
 * worldStore.ts — module-level pub-sub store for Parley shell world state.
 *
 * State:
 *   worlds: WorldSummary[]           — loaded from /api/worlds
 *   appliedThemeWorldId: string|null — which world's theme is currently active
 *
 * Functions:
 *   loadWorlds()              — fetch /api/worlds once, cache result
 *   applyThemeForWorld(id)    — calls loadWorldTheme + updates appliedThemeWorldId
 *   clearTheme()              — removes active theme, resets appliedThemeWorldId
 *   useStore<T>(selector)     — Preact hook for reactive slice of store
 */

import { useState, useEffect } from "preact/hooks";
import { getWorlds } from "../../sdk/api.js";
import type { WorldSummary } from "../../sdk/api.js";
import { loadWorldTheme } from "../theme/loadWorldTheme.js";

// ── Store state ───────────────────────────────────────────────────────────────

interface StoreState {
  worlds: WorldSummary[];
  worldsLoaded: boolean;
  worldsError: string | null;
  appliedThemeWorldId: string | null;
}

let state: StoreState = {
  worlds: [],
  worldsLoaded: false,
  worldsError: null,
  appliedThemeWorldId: null,
};

// ── Subscriber set ────────────────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<StoreState>): void {
  state = { ...state, ...patch };
  notify();
}

// ── Load guard ────────────────────────────────────────────────────────────────

let worldsLoadPromise: Promise<void> | null = null;

/**
 * Fetch /api/worlds once per session. Subsequent calls are no-ops if already
 * loading or loaded.
 */
export async function loadWorlds(): Promise<void> {
  if (state.worldsLoaded || worldsLoadPromise) {
    return worldsLoadPromise ?? Promise.resolve();
  }
  worldsLoadPromise = (async () => {
    try {
      const worlds = await getWorlds();
      setState({ worlds, worldsLoaded: true, worldsError: null });
    } catch (err) {
      setState({
        worldsError:
          err instanceof Error ? err.message : "Could not load worlds.",
        worldsLoaded: true,
      });
    }
  })();
  return worldsLoadPromise;
}

/**
 * Reset world load state — used to force a re-fetch.
 * Primarily for tests and error-retry flows.
 */
export function resetWorlds(): void {
  worldsLoadPromise = null;
  setState({ worlds: [], worldsLoaded: false, worldsError: null });
}

// ── Theme actions ─────────────────────────────────────────────────────────────

/** The ID of the currently active theme <link> element. */
const THEME_LINK_ID = "parley-world-theme";

/**
 * Load and apply the theme for the given world. Updates appliedThemeWorldId.
 */
export async function applyThemeForWorld(worldId: string): Promise<void> {
  try {
    await loadWorldTheme(worldId);
    setState({ appliedThemeWorldId: worldId });

    // Set data-world-id on the root so CSS vars scope to this world.
    if (typeof document !== "undefined") {
      document.documentElement.dataset.worldId = worldId;
    }
  } catch (err) {
    console.error(`[Parley] Failed to apply theme for world "${worldId}":`, err);
  }
}

/**
 * Remove the active world theme and reset to neutral Parley chrome.
 */
export function clearTheme(): void {
  // Remove any injected theme stylesheet.
  if (typeof document !== "undefined") {
    const existing = document.getElementById(THEME_LINK_ID);
    if (existing) {
      existing.remove();
    }
    // Remove the world-id data attribute so no world-scoped CSS vars apply.
    delete document.documentElement.dataset.worldId;
  }
  setState({ appliedThemeWorldId: null });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Reactive hook into the world store. Re-renders the subscriber whenever
 * the store changes AND the selected value differs (by reference).
 *
 * @param selector  Pure function from StoreState → T.
 */
export function useStore<T>(selector: (s: StoreState) => T): T {
  const [value, setValue] = useState<T>(() => selector(state));

  useEffect(() => {
    const listener: Listener = () => {
      const next = selector(state);
      setValue((prev) => {
        // Avoid re-render when reference hasn't changed (works for primitives
        // and for the same array reference returned on a cache hit).
        return prev === next ? prev : next;
      });
    };
    listeners.add(listener);
    // Re-read immediately in case the state changed between render and effect.
    listener();
    return () => {
      listeners.delete(listener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

// ── Selectors ─────────────────────────────────────────────────────────────────

export function selectWorlds(s: StoreState): WorldSummary[] {
  return s.worlds;
}
export function selectWorldsLoaded(s: StoreState): boolean {
  return s.worldsLoaded;
}
export function selectWorldsError(s: StoreState): string | null {
  return s.worldsError;
}
export function selectAppliedThemeWorldId(s: StoreState): string | null {
  return s.appliedThemeWorldId;
}
