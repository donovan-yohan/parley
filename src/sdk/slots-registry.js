/**
 * Pure-JS registry backing the slot system.
 *
 * Kept as a plain .js module so that Node --test suites can import and
 * exercise the registry layer without needing tsx or a Preact renderer.
 *
 * `slots.ts` re-exports the public surface and adds the Preact-aware
 * hook / component wrappers on top.
 */

/**
 * Registry: worldId → (slotName → component).
 * Last-write-wins for duplicate registration.
 *
 * @type {Map<string, Map<string, Function>>}
 */
export const slotRegistry = new Map();

/**
 * Module-level subscriber list for useSlot re-renders on late registration.
 *
 * @type {Set<() => void>}
 */
export const subscribers = new Set();

/** Notify all subscribers (called after every registerSlot). */
export function notifySubscribers() {
  for (const fn of subscribers) {
    fn();
  }
}

/**
 * Register a component into a named slot for a specific world.
 * Calling again with the same (worldId, slot) replaces the previous component.
 *
 * @param {string} worldId
 * @param {string} slot
 * @param {Function} component
 */
export function registerSlot(worldId, slot, component) {
  if (!slotRegistry.has(worldId)) {
    slotRegistry.set(worldId, new Map());
  }
  slotRegistry.get(worldId).set(slot, component);
  notifySubscribers();
}

/**
 * Look up a registered component for (worldId, slot), or return null.
 *
 * This is the underlying lookup used by the useSlot hook and by tests.
 *
 * @param {string} worldId
 * @param {string} slot
 * @returns {Function | null}
 */
export function getSlot(worldId, slot) {
  return slotRegistry.get(worldId)?.get(slot) ?? null;
}

/**
 * Remove all entries from the registry.
 * Intended for use in test teardown only — do not call in production code.
 */
export function __resetRegistryForTests() {
  slotRegistry.clear();
}
