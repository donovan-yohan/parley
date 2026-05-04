/**
 * router.ts — hash-based router for the Parley shell.
 *
 * Routes:
 *   #/                                              → { kind: "landing" }
 *   #/world/:worldId/:instanceId                    → { kind: "worldHome" }
 *   #/world/:worldId/:instanceId/story/:storyId     → { kind: "storyPlay" }
 *   anything else                                   → { kind: "landing" } (fallback)
 */

import { useState, useEffect } from "preact/hooks";

// ── Route types ───────────────────────────────────────────────────────────────

export type Route =
  | { kind: "landing" }
  | { kind: "worldHome"; worldId: string; instanceId: string }
  | { kind: "storyPlay"; worldId: string; instanceId: string; storyId: string };

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a hash string (including the leading `#`) into a Route.
 * Invalid or unrecognised hashes fall back to `{ kind: "landing" }`.
 */
export function parseRoute(hash: string): Route {
  // Normalise: strip leading `#` and then leading `/`
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = raw.startsWith("/") ? raw.slice(1) : raw;

  if (path === "" || path === "/") {
    return { kind: "landing" };
  }

  // #/world/:worldId/:instanceId/story/:storyId
  const storyMatch = path.match(
    /^world\/([^/]+)\/([^/]+)\/story\/([^/]+)$/
  );
  if (storyMatch) {
    return {
      kind: "storyPlay",
      worldId: decodeURIComponent(storyMatch[1]),
      instanceId: decodeURIComponent(storyMatch[2]),
      storyId: decodeURIComponent(storyMatch[3]),
    };
  }

  // #/world/:worldId/:instanceId
  const worldMatch = path.match(/^world\/([^/]+)\/([^/]+)$/);
  if (worldMatch) {
    return {
      kind: "worldHome",
      worldId: decodeURIComponent(worldMatch[1]),
      instanceId: decodeURIComponent(worldMatch[2]),
    };
  }

  return { kind: "landing" };
}

// ── Navigation ────────────────────────────────────────────────────────────────

/**
 * Programmatic navigation. Sets `window.location.hash`, which fires a
 * `hashchange` event that `useRoute()` subscribers pick up.
 *
 * `path` should be the hash path without the leading `#`; e.g. `/world/last-lantern/playthrough-1`.
 * If `path` already starts with `#`, it is used as-is.
 */
export function navigate(path: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}

// ── Module-level subscriber list ──────────────────────────────────────────────

type RouteListener = (route: Route) => void;
const listeners = new Set<RouteListener>();

function currentRoute(): Route {
  if (typeof window === "undefined") return { kind: "landing" };
  return parseRoute(window.location.hash || "#/");
}

// Wire up the single global hashchange handler once.
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const route = currentRoute();
    for (const listener of listeners) {
      listener(route);
    }
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Preact hook that returns the current Route and re-renders whenever the
 * hash changes.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    // Re-read immediately in case the hash changed between first render and effect.
    setRoute(currentRoute());

    const listener: RouteListener = (newRoute) => setRoute(newRoute);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return route;
}
