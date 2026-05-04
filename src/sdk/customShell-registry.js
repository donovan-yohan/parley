/**
 * Pure-JS registry backing the custom-shell system.
 *
 * Kept as a plain .js module so that Node --test suites can import and
 * exercise the registry layer without needing tsx or a Preact renderer.
 *
 * `customShell.ts` re-exports the public surface and adds the Preact-aware
 * hook wrappers on top.
 */

/**
 * Registry: worldId → { renderWorldHome, renderStoryPlay }.
 * Last-write-wins for duplicate registration.
 *
 * @type {Map<string, { renderWorldHome: Function, renderStoryPlay: Function }>}
 */
export const customShellRegistry = new Map();

/**
 * Module-level subscriber list for shell re-renders on late registration.
 *
 * @type {Set<() => void>}
 */
export const subscribers = new Set();

/** Notify all subscribers (called after every registerCustomShell). */
export function notifySubscribers() {
  for (const fn of subscribers) {
    fn();
  }
}

/**
 * Register a full custom shell (L2 + L3 render functions) for a specific world.
 * Calling again with the same worldId replaces the previous handlers.
 *
 * @param {string} worldId
 * @param {{ renderWorldHome: Function, renderStoryPlay: Function }} handlers
 */
export function registerCustomShell(worldId, handlers) {
  customShellRegistry.set(worldId, handlers);
  notifySubscribers();
}

/**
 * Look up registered custom shell handlers for a worldId, or return null.
 *
 * @param {string} worldId
 * @returns {{ renderWorldHome: Function, renderStoryPlay: Function } | null}
 */
export function getCustomShell(worldId) {
  return customShellRegistry.get(worldId) ?? null;
}

/**
 * Remove all entries from the registry.
 * Intended for use in test teardown only — do not call in production code.
 */
export function __resetRegistryForTests() {
  customShellRegistry.clear();
}
