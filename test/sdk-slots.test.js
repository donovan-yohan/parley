/**
 * Tests for the slot registry layer (src/sdk/slots-registry.js).
 *
 * We test the pure-JS registry module directly so that no Preact renderer or
 * tsx loader is required.  The hook (useSlot) and component (PluginSlot) live
 * in slots.ts and rely on the same registry, so correct registry behaviour
 * transitively validates the hook's lookup path.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  registerSlot,
  getSlot,
  __resetRegistryForTests,
} from "../src/sdk/slots-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal stub that satisfies the SlotComponent shape (worldId → VNode | null). */
function makeComponent(label) {
  function SlotStub() { return null; }
  SlotStub.displayName = label;
  return SlotStub;
}

// Reset the shared registry before every test so tests don't bleed into each other.
test.beforeEach(() => {
  __resetRegistryForTests();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("registerSlot stores a component for a (worldId, slot) pair", () => {
  const comp = makeComponent("backdrop");
  registerSlot("world-a", "scene-backdrop", comp);

  const found = getSlot("world-a", "scene-backdrop");
  assert.equal(found, comp, "getSlot should return the registered component");
});

test("registerSlot is last-write-wins for duplicate (worldId, slot) pairs", () => {
  const first = makeComponent("first");
  const second = makeComponent("second");

  registerSlot("world-a", "dialogue-frame", first);
  registerSlot("world-a", "dialogue-frame", second);

  const found = getSlot("world-a", "dialogue-frame");
  assert.equal(found, second, "second registration should overwrite the first");
});

test("registerSlot for one worldId does not affect another worldId", () => {
  const compA = makeComponent("comp-a");
  const compB = makeComponent("comp-b");

  registerSlot("world-a", "header-crest", compA);
  registerSlot("world-b", "header-crest", compB);

  assert.equal(getSlot("world-a", "header-crest"), compA);
  assert.equal(getSlot("world-b", "header-crest"), compB);
});

test("getSlot returns null for an unregistered (worldId, slot) pair", () => {
  const result = getSlot("unknown-world", "sidebar-rail");
  assert.equal(result, null);
});

test("getSlot returns null when worldId is registered but slot is not", () => {
  registerSlot("world-a", "footer-tagline", makeComponent("footer"));

  // "sidebar-rail" was never registered for world-a
  const result = getSlot("world-a", "sidebar-rail");
  assert.equal(result, null);
});

test("getSlot returns the registered component when found", () => {
  const comp = makeComponent("tagline");
  registerSlot("world-x", "header-tagline", comp);

  const found = getSlot("world-x", "header-tagline");
  assert.equal(found, comp);
});

test("different slots for the same worldId are independent", () => {
  const rail = makeComponent("rail");
  const crest = makeComponent("crest");

  registerSlot("world-z", "sidebar-rail", rail);
  registerSlot("world-z", "header-crest", crest);

  assert.equal(getSlot("world-z", "sidebar-rail"), rail);
  assert.equal(getSlot("world-z", "header-crest"), crest);
  // A third slot on the same world should still be absent
  assert.equal(getSlot("world-z", "inventory-rail"), null);
});

test("registerSlot and getSlot are round-trip stable across multiple worlds and slots", () => {
  const worlds = ["world-1", "world-2", "world-3"];
  const slots = ["scene-backdrop", "dialogue-frame", "header-crest"];
  const components = new Map();

  for (const w of worlds) {
    for (const s of slots) {
      const comp = makeComponent(`${w}:${s}`);
      components.set(`${w}:${s}`, comp);
      registerSlot(w, s, comp);
    }
  }

  for (const w of worlds) {
    for (const s of slots) {
      const expected = components.get(`${w}:${s}`);
      assert.equal(getSlot(w, s), expected, `Expected component for (${w}, ${s})`);
    }
  }
});
