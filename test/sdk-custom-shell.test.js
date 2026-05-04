/**
 * Tests for the custom-shell registry layer (src/sdk/customShell-registry.js).
 *
 * We test the pure-JS registry module directly so that no Preact renderer or
 * tsx loader is required.  The TypeScript wrapper (customShell.ts) relies on
 * the same registry, so correct registry behaviour transitively validates the
 * wrapper's lookup path.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  registerCustomShell,
  getCustomShell,
  subscribers,
  __resetRegistryForTests,
} from "../src/sdk/customShell-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal handler stubs satisfying the CustomShellHandlers shape. */
function makeHandlers(label) {
  return {
    renderWorldHome: () => ({ type: `world-home-${label}` }),
    renderStoryPlay: () => ({ type: `story-play-${label}` }),
  };
}

// Reset the shared registry before every test so tests don't bleed into each other.
test.beforeEach(() => {
  __resetRegistryForTests();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("registerCustomShell stores handlers for a worldId", () => {
  const handlers = makeHandlers("cyber");
  registerCustomShell("night-city-after-curfew", handlers);

  const found = getCustomShell("night-city-after-curfew");
  assert.equal(found, handlers, "getCustomShell should return the registered handlers");
});

test("registerCustomShell is last-write-wins", () => {
  const first = makeHandlers("first");
  const second = makeHandlers("second");

  registerCustomShell("night-city-after-curfew", first);
  registerCustomShell("night-city-after-curfew", second);

  const found = getCustomShell("night-city-after-curfew");
  assert.equal(found, second, "second registration should overwrite the first");
});

test("getCustomShell returns null for unregistered worldId", () => {
  const result = getCustomShell("unknown-world");
  assert.equal(result, null);
});

test("subscribers fire on registration", () => {
  let callCount = 0;
  const notify = () => { callCount += 1; };

  subscribers.add(notify);
  try {
    registerCustomShell("night-city-after-curfew", makeHandlers("cyber"));
    assert.equal(callCount, 1, "subscriber should be called once after registration");
  } finally {
    subscribers.delete(notify);
  }
});
