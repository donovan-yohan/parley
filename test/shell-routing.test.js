/**
 * shell-routing.test.js — Unit tests for src/shell/router.ts
 *
 * Tests parseRoute for all 3 route shapes + invalid → landing fallback.
 * Tests navigate updates location.hash.
 *
 * Note: useRoute is a Preact hook requiring a DOM/render environment;
 * we test it implicitly via parseRoute + navigate rather than mounting components.
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";

// Minimal window/location stub so the module loads without errors
let hashValue = "#/";
const mockWindow = {
  location: {
    get hash() { return hashValue; },
    set hash(v) { hashValue = v; }
  },
  addEventListener: () => {},
  removeEventListener: () => {}
};

// We need to patch globalThis before importing the router module.
// Use a workaround: import parseRoute + navigate as pure functions via dynamic import
// after patching.
const globalAny = globalThis;
let origWindow;

before(() => {
  origWindow = globalAny.window;
  // Use Object.defineProperty for the window global (some environments are strict)
  try {
    globalAny.window = mockWindow;
  } catch {
    // window may be non-configurable — try assigning anyway
  }
});

after(() => {
  try {
    globalAny.window = origWindow;
  } catch {
    // ignore
  }
});

// Import after mock is set up
import("../src/shell/router.ts").then(() => {}).catch(() => {});

// We can test parseRoute as a pure function without the window dependency.
// Import it directly.
const { parseRoute, navigate } = await import("../src/shell/router.ts");

describe("parseRoute", () => {
  test("#/ → landing", () => {
    const route = parseRoute("#/");
    assert.deepEqual(route, { kind: "landing" });
  });

  test("empty string → landing", () => {
    const route = parseRoute("");
    assert.deepEqual(route, { kind: "landing" });
  });

  test("# alone → landing", () => {
    const route = parseRoute("#");
    assert.deepEqual(route, { kind: "landing" });
  });

  test("#/world/:worldId/:instanceId → worldHome", () => {
    const route = parseRoute("#/world/last-lantern/playthrough-1");
    assert.deepEqual(route, {
      kind: "worldHome",
      worldId: "last-lantern",
      instanceId: "playthrough-1"
    });
  });

  test("#/world/:worldId/:instanceId/story/:storyId → storyPlay", () => {
    const route = parseRoute("#/world/last-lantern/playthrough-1/story/rain-at-the-crossroads");
    assert.deepEqual(route, {
      kind: "storyPlay",
      worldId: "last-lantern",
      instanceId: "playthrough-1",
      storyId: "rain-at-the-crossroads"
    });
  });

  test("URL-encoded worldId/instanceId → decoded", () => {
    const route = parseRoute("#/world/my%20world/playthrough%201");
    assert.deepEqual(route, {
      kind: "worldHome",
      worldId: "my world",
      instanceId: "playthrough 1"
    });
  });

  test("invalid path → landing fallback", () => {
    const route = parseRoute("#/invalid/path/that/has/too/many/segments");
    assert.deepEqual(route, { kind: "landing" });
  });

  test("unknown prefix → landing fallback", () => {
    const route = parseRoute("#/something-random");
    assert.deepEqual(route, { kind: "landing" });
  });

  test("#/world/:worldId only (no instanceId) → landing fallback", () => {
    const route = parseRoute("#/world/last-lantern");
    assert.deepEqual(route, { kind: "landing" });
  });

  test("worldHome with numeric playthrough", () => {
    const route = parseRoute("#/world/neon-afterhours/playthrough-2");
    assert.deepEqual(route, {
      kind: "worldHome",
      worldId: "neon-afterhours",
      instanceId: "playthrough-2"
    });
  });
});

describe("navigate", () => {
  before(() => {
    hashValue = "#/";
  });

  test("navigate sets window.location.hash with # prefix", () => {
    navigate("/world/last-lantern/playthrough-1");
    assert.equal(hashValue, "#/world/last-lantern/playthrough-1");
  });

  test("navigate with # prefix does not double-prefix", () => {
    navigate("#/world/orchard-welcome/playthrough-1");
    assert.equal(hashValue, "#/world/orchard-welcome/playthrough-1");
  });

  test("navigate to landing", () => {
    navigate("/");
    assert.equal(hashValue, "#/");
  });
});
