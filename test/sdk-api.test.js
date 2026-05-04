/**
 * Tests for the SDK API client (src/sdk/api.ts).
 *
 * The SDK functions (getWorlds, getInstance, createInstance, getStory,
 * getStories, createStory, runTurn) call fetchJSON which uses the global fetch
 * with bare relative URLs like "/api/worlds".  We route those calls through an
 * in-process Parley server by monkey-patching globalThis.fetch, restoring it in
 * finally blocks.
 *
 * State-mutating tests create directories under
 *   repoRoot/instances/<testWorldId>/
 * where <testWorldId> starts with "test-" (real world IDs are last-lantern,
 * neon-afterhours, orchard-welcome) and clean up with rm -rf in finally blocks
 * so they never pollute real fixture data.
 */

import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { repoRoot } from "../src/runtime/scenarioPacks.js";
import { createParleyServer } from "../src/server.js";
import { requestServer } from "./support/inProcessServer.js";

import {
  getWorlds,
  getInstance,
  createInstance,
  getStories,
  createStory,
  getStory,
  runTurn,
} from "../src/sdk/api.ts";

// ── In-process fetch shim ────────────────────────────────────────────────────
//
// Mirrors the pattern from agent-author-seam.test.js: strip any scheme+host
// from the URL so bare relative paths work, then route through the in-process
// server via requestServer().

function makeInProcessFetch(server) {
  return async (url, options = {}) => {
    const pathname =
      typeof url === "string" ? url.replace(/^https?:\/\/[^/]+/, "") : url.pathname;
    const result = await requestServer(server, {
      method: options.method ?? "GET",
      url: pathname,
      body: options.body,
    });
    const bodyText = result.body;
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: {
        get(name) {
          return result.headers[name.toLowerCase()] ?? null;
        },
      },
      json() {
        return Promise.resolve(JSON.parse(bodyText));
      },
      text() {
        return Promise.resolve(bodyText);
      },
    };
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Unique test world ID — never collides with real world IDs. */
function uniqueTestWorldId() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Remove the whole instances/<worldId> tree after a test. */
async function cleanupWorldInstances(worldId) {
  const dir = path.join(repoRoot, "instances", worldId);
  await rm(dir, { recursive: true, force: true });
}

/** Create a minimal instance directory so read-tests have something to find. */
async function seedInstanceDir(worldId, instanceId, displayName) {
  const instanceDir = path.join(repoRoot, "instances", worldId, instanceId);
  await mkdir(instanceDir, { recursive: true });
  const meta = {
    displayName: displayName ?? `Playthrough 1`,
    createdAt: new Date().toISOString(),
    lastPlayedAt: null,
  };
  await writeFile(
    path.join(instanceDir, "instance.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8"
  );
  return instanceDir;
}

// ── Tests: getWorlds ─────────────────────────────────────────────────────────

test("getWorlds returns a non-empty array of WorldSummary", async () => {
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const worlds = await getWorlds();

    assert.ok(Array.isArray(worlds), "getWorlds should return an array");
    assert.ok(worlds.length > 0, "worlds array should be non-empty");

    // Each entry must have the four required WorldSummary fields.
    for (const world of worlds) {
      assert.ok(
        typeof world.id === "string" && world.id.length > 0,
        `world.id must be a non-empty string (got ${JSON.stringify(world.id)})`
      );
      assert.ok(
        typeof world.name === "string" && world.name.length > 0,
        `world.name must be a non-empty string (got ${JSON.stringify(world.name)})`
      );
      assert.ok(typeof world.premise === "string", "world.premise must be a string");
      assert.ok(typeof world.tone === "string", "world.tone must be a string");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getWorlds includes all three installed worlds", async () => {
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const worlds = await getWorlds();
    const ids = worlds.map((w) => w.id).sort();

    assert.deepEqual(
      ids,
      ["last-lantern", "neon-afterhours", "orchard-welcome"],
      "exactly the three installed worlds must be returned"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Tests: getInstance ───────────────────────────────────────────────────────

test("getInstance returns InstanceSummary for last-lantern/playthrough-1", async () => {
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const instance = await getInstance("last-lantern", "playthrough-1");

    assert.equal(instance.worldId, "last-lantern");
    assert.equal(instance.instanceId, "playthrough-1");
    assert.ok(
      typeof instance.displayName === "string",
      "displayName must be a string"
    );
    assert.ok(
      typeof instance.createdAt === "string",
      "createdAt must be a string"
    );
    // lastPlayedAt is nullable
    assert.ok(
      instance.lastPlayedAt === null || typeof instance.lastPlayedAt === "string",
      "lastPlayedAt must be null or a string"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getInstance throws structured error for nonexistent instance (statusCode 404)", async () => {
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    await assert.rejects(
      () => getInstance("last-lantern", "no-such-instance-xyz"),
      (error) => {
        assert.ok(error instanceof Error, "should throw an Error");
        // fetchJSON sets .status (not .statusCode) per utils.ts
        assert.equal(
          error.status,
          404,
          `expected status 404 but got ${error.status}; message: ${error.message}`
        );
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Tests: createInstance ────────────────────────────────────────────────────

test("createInstance creates playthrough-1 then playthrough-2 (auto-numbered)", async () => {
  const worldId = uniqueTestWorldId();
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const first = await createInstance(worldId);
    assert.equal(first.worldId, worldId);
    assert.equal(first.instanceId, "playthrough-1", "first call should produce playthrough-1");
    assert.ok(typeof first.displayName === "string", "displayName should be set");
    assert.ok(typeof first.createdAt === "string", "createdAt should be set");
    assert.equal(first.lastPlayedAt, null);

    const second = await createInstance(worldId);
    assert.equal(second.instanceId, "playthrough-2", "second call should produce playthrough-2");
  } finally {
    globalThis.fetch = originalFetch;
    await cleanupWorldInstances(worldId);
  }
});

test("createInstance accepts a custom displayName and persists it", async () => {
  const worldId = uniqueTestWorldId();
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const created = await createInstance(worldId, "My Custom Run");
    assert.equal(created.worldId, worldId);
    assert.equal(created.instanceId, "playthrough-1");
    assert.equal(created.displayName, "My Custom Run");

    // Verify the persisted name is readable back via getInstance
    const fetched = await getInstance(worldId, "playthrough-1");
    assert.equal(fetched.displayName, "My Custom Run");
  } finally {
    globalThis.fetch = originalFetch;
    await cleanupWorldInstances(worldId);
  }
});

// ── Tests: getStories ────────────────────────────────────────────────────────

test("getStories returns templates list and instances list separately", async () => {
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    // Use the real last-lantern world + playthrough-1 so templates come from world.json
    const result = await getStories("last-lantern", "playthrough-1");

    assert.ok(Array.isArray(result.templates), "templates must be an array");
    assert.ok(Array.isArray(result.instances), "instances must be an array");
    assert.ok(result.templates.length >= 1, "last-lantern should have at least one template");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Tests: createStory ───────────────────────────────────────────────────────

test("createStory creates a story instance with status: in_progress", async () => {
  const worldId = uniqueTestWorldId();
  const instanceId = "playthrough-1";
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    await seedInstanceDir(worldId, instanceId, "Test Run");

    const story = await createStory(worldId, instanceId, "main-quest");

    assert.equal(story.worldId, worldId);
    assert.equal(story.instanceId, instanceId);
    assert.equal(story.storyId, "main-quest");
    assert.equal(story.status, "in_progress");
    assert.equal(story.turnCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await cleanupWorldInstances(worldId);
  }
});

// ── Tests: runTurn ───────────────────────────────────────────────────────────

test("runTurn (new shape) returns AuthoredTurn-shaped response", async () => {
  // handleRunTurnNew adapts the mock runtime result to the AuthoredTurn shape:
  //   responseId, narration, speakers, nextChoices, proposedFacts,
  //   storyConsequence, beatRedirect
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const result = await runTurn({
      worldId: "last-lantern",
      instanceId: "playthrough-1",
      storyId: null,
      playerAction: "I ask who remembers the old north road.",
    });

    assert.ok(
      typeof result.responseId === "string" && result.responseId.length > 0,
      "responseId must be a non-empty string"
    );
    assert.ok(
      typeof result.narration === "string" && result.narration.length > 0,
      "narration must be a non-empty string"
    );
    assert.ok(Array.isArray(result.speakers), "speakers must be an array");
    assert.ok(Array.isArray(result.nextChoices), "nextChoices must be an array");
    assert.ok(Array.isArray(result.proposedFacts), "proposedFacts must be an array");
    assert.ok("storyConsequence" in result, "storyConsequence key must be present");
    assert.ok("beatRedirect" in result, "beatRedirect key must be present");

    // The last-lantern mock fixture always mentions Mara Underbough
    assert.match(result.narration, /Mara Underbough/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Tests: getStory ──────────────────────────────────────────────────────────

test("getStory returns story state including turnCount and status", async () => {
  const worldId = uniqueTestWorldId();
  const instanceId = "playthrough-1";
  const storyId = "intro-scene";
  const server = createParleyServer();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    await seedInstanceDir(worldId, instanceId, "Test Run");

    // Write a story.json so getStory can read it back
    const storyDir = path.join(
      repoRoot, "instances", worldId, instanceId, "stories", storyId
    );
    await mkdir(storyDir, { recursive: true });
    const storyMeta = {
      status: "in_progress",
      createdAt: new Date().toISOString(),
      turnCount: 5,
    };
    await writeFile(
      path.join(storyDir, "story.json"),
      `${JSON.stringify(storyMeta, null, 2)}\n`,
      "utf8"
    );

    const story = await getStory({ worldId, instanceId, storyId });

    assert.equal(story.worldId, worldId);
    assert.equal(story.instanceId, instanceId);
    assert.equal(story.storyId, storyId);
    assert.equal(story.status, "in_progress");
    assert.equal(story.turnCount, 5);
  } finally {
    globalThis.fetch = originalFetch;
    await cleanupWorldInstances(worldId);
  }
});
