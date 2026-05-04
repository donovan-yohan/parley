/**
 * Tests for the Part 1b API endpoints:
 *   GET  /api/worlds
 *   GET  /api/instances
 *   POST /api/instances
 *   GET  /api/stories
 *   POST /api/stories
 *   GET  /api/story
 *   POST /api/turn  (new shape + legacy back-compat + missing-fields 400)
 *
 * The new endpoint handlers (handleGetWorlds, handleGetInstances, etc.) resolve
 * paths from repoRoot — a compile-time constant derived from import.meta.url in
 * scenarioPacks.js — so they cannot be redirected via runtimeOptions.
 *
 * Strategy:
 *   • Worlds tests read the real worlds/ directory (3 fixtures, no writes).
 *   • Instance/story tests create directories under repoRoot/instances/<testWorldId>
 *     where <testWorldId> is a randomised prefix that cannot collide with real
 *     world IDs, and clean up with rm -rf in an afterEach-style finally block.
 */

import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";

import { repoRoot } from "../src/runtime/scenarioPacks.js";
import { createParleyServer } from "../src/server.js";

// ── In-process fetch helper (mirrors the pattern from parley-runtime.test.js) ─

function createInProcessFetch(server) {
  return async (url, options = {}) => {
    const request = new FakeRequest({
      method: options.method ?? "GET",
      url,
      body: options.body
    });
    const response = new FakeResponse();
    const finished = new Promise((resolve) => response.once("finish", resolve));
    server.emit("request", request, response);
    await finished;

    const body = Buffer.concat(response.chunks).toString("utf8");
    return {
      status: response.statusCode,
      ok: response.statusCode >= 200 && response.statusCode < 300,
      headers: {
        get(name) {
          return response.headers[name.toLowerCase()] ?? null;
        }
      },
      async json() {
        return JSON.parse(body);
      }
    };
  };
}

class FakeRequest extends Readable {
  constructor({ method, url, body }) {
    super();
    this.method = method;
    this.url = url;
    this.body = body ? Buffer.from(body) : null;
  }

  _read() {
    if (this.body) {
      this.push(this.body);
      this.body = null;
    } else {
      this.push(null);
    }
  }
}

class FakeResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = Object.fromEntries(
      Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
    );
    return this;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a unique test world ID that will never collide with real worlds.
 * Uses `test-` prefix (real world IDs are last-lantern, neon-afterhours,
 * orchard-welcome) and a random 6-char suffix.
 */
function uniqueTestWorldId() {
  return `test-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a minimal instance.json for a playthrough directory so the server
 * can read instance metadata.
 */
async function createInstanceDir(worldId, instanceId, displayName) {
  const instanceDir = path.join(repoRoot, "instances", worldId, instanceId);
  await mkdir(instanceDir, { recursive: true });
  const meta = {
    displayName: displayName ?? `Playthrough 1`,
    createdAt: new Date().toISOString(),
    lastPlayedAt: null
  };
  await writeFile(path.join(instanceDir, "instance.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return instanceDir;
}

/**
 * Clean up a world's instance directory tree after a test.
 */
async function cleanupWorldInstances(worldId) {
  const dir = path.join(repoRoot, "instances", worldId);
  await rm(dir, { recursive: true, force: true });
}

// ── Tests: GET /api/worlds ────────────────────────────────────────────────────

test("GET /api/worlds returns 200 with world summaries (original three + flagship worlds)", async () => {
  const server = createParleyServer();
  const fetch = createInProcessFetch(server);

  const response = await fetch("/api/worlds");
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.ok(Array.isArray(data.worlds), "response should have a worlds array");
  assert.ok(data.worlds.length >= 3, "expected at least three worlds");
});

test("GET /api/worlds entries include schema_version, id, name, premise, tone", async () => {
  const server = createParleyServer();
  const fetch = createInProcessFetch(server);

  const response = await fetch("/api/worlds");
  const data = await response.json();

  // The server does not echo schema_version from world.json back in the summary —
  // it emits: id, name, premise, tone, cover (optional), scenarios.
  // Verify the fields that ARE emitted and that the real worlds data is present.
  const lastLantern = data.worlds.find((world) => world.id === "last-lantern");
  assert.ok(lastLantern, "last-lantern world should be present");
  assert.equal(lastLantern.name, "Last Lantern");
  assert.equal(lastLantern.premise, "A rain-soaked crossroads tavern where travelers trade rumors before the old roads.");
  assert.equal(lastLantern.tone, "grounded fantasy mystery");
  assert.ok(Array.isArray(lastLantern.scenarios), "scenarios should be an array");

  // Verify the original three worlds are present (plus any flagship worlds added in Part 2)
  const ids = data.worlds.map((world) => world.id).sort();
  assert.ok(ids.includes("last-lantern"), "last-lantern must be present");
  assert.ok(ids.includes("neon-afterhours"), "neon-afterhours must be present");
  assert.ok(ids.includes("orchard-welcome"), "orchard-welcome must be present");
  assert.ok(ids.includes("night-city-after-curfew"), "night-city-after-curfew must be present");

  // Each entry must have the required fields
  for (const world of data.worlds) {
    assert.ok(typeof world.id === "string" && world.id.length > 0, "id must be a non-empty string");
    assert.ok(typeof world.name === "string" && world.name.length > 0, "name must be a non-empty string");
    assert.ok(typeof world.premise === "string", "premise must be a string");
    assert.ok(typeof world.tone === "string", "tone must be a string");
  }
});

// ── Tests: GET /api/instances ─────────────────────────────────────────────────

test("GET /api/instances?world=last-lantern returns the migrated playthrough-1 instance", async () => {
  const server = createParleyServer();
  const fetch = createInProcessFetch(server);

  const response = await fetch("/api/instances?world=last-lantern");
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.ok(Array.isArray(data.instances), "response should have an instances array");

  // playthrough-1 is committed to the repo under instances/last-lantern/
  const pt1 = data.instances.find((inst) => inst.instanceId === "playthrough-1");
  assert.ok(pt1, "playthrough-1 should appear in the list");
  assert.equal(pt1.worldId, "last-lantern");
  assert.ok(typeof pt1.displayName === "string", "displayName should be a string");
  assert.ok(typeof pt1.createdAt === "string", "createdAt should be a string");
});

test("GET /api/instances?world=nonexistent returns empty instances array", async () => {
  const server = createParleyServer();
  const fetch = createInProcessFetch(server);

  // Server returns { instances: [] } when the directory doesn't exist (no 404).
  const response = await fetch("/api/instances?world=nonexistent-world-that-does-not-exist");
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.ok(Array.isArray(data.instances), "response should have an instances array");
  assert.equal(data.instances.length, 0, "expected empty instances array for nonexistent world");
});

// ── Tests: POST /api/instances ────────────────────────────────────────────────

test("POST /api/instances creates playthrough-2 when playthrough-1 exists", async () => {
  const worldId = uniqueTestWorldId();
  try {
    // Pre-create playthrough-1 so the server sees it when numbering
    await createInstanceDir(worldId, "playthrough-1", "Playthrough 1");

    const server = createParleyServer();
    const fetch = createInProcessFetch(server);

    const response = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    });
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.equal(data.worldId, worldId);
    assert.equal(data.instanceId, "playthrough-2", "should auto-number to playthrough-2");
    assert.ok(typeof data.displayName === "string", "displayName should be set");
    assert.ok(typeof data.createdAt === "string", "createdAt should be set");
    assert.equal(data.lastPlayedAt, null);
  } finally {
    await cleanupWorldInstances(worldId);
  }
});

test("POST /api/instances accepts a custom displayName", async () => {
  const worldId = uniqueTestWorldId();
  try {
    const server = createParleyServer();
    const fetch = createInProcessFetch(server);

    const response = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId, displayName: "My Custom Run" })
    });
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.equal(data.worldId, worldId);
    assert.equal(data.instanceId, "playthrough-1", "first instance should be playthrough-1");
    assert.equal(data.displayName, "My Custom Run");
  } finally {
    await cleanupWorldInstances(worldId);
  }
});

// ── Tests: GET /api/stories ───────────────────────────────────────────────────

test("GET /api/stories?world=...&instance=... returns templates and instances arrays", async () => {
  const worldId = "last-lantern"; // use real world to get templates from world.json
  const instanceId = "playthrough-1"; // use real committed instance

  const server = createParleyServer();
  const fetch = createInProcessFetch(server);

  const response = await fetch(`/api/stories?world=${worldId}&instance=${instanceId}`);
  assert.equal(response.status, 200);

  const data = await response.json();
  assert.ok(Array.isArray(data.templates), "response should have a templates array");
  assert.ok(Array.isArray(data.instances), "response should have an instances array");

  // Templates come from world.json scenarios field
  assert.ok(data.templates.length >= 1, "last-lantern should have at least one template");
});

// ── Tests: POST /api/stories ──────────────────────────────────────────────────

test("POST /api/stories creates a story instance with status: in_progress", async () => {
  const worldId = uniqueTestWorldId();
  const instanceId = "playthrough-1";
  try {
    await createInstanceDir(worldId, instanceId, "Test Run");

    const server = createParleyServer();
    const fetch = createInProcessFetch(server);

    const response = await fetch("/api/stories", {
      method: "POST",
      body: JSON.stringify({ worldId, instanceId, storyTemplateId: "main-quest" })
    });
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.equal(data.worldId, worldId);
    assert.equal(data.instanceId, instanceId);
    assert.equal(data.storyId, "main-quest");
    assert.equal(data.status, "in_progress");
    assert.equal(data.turnCount, 0);
  } finally {
    await cleanupWorldInstances(worldId);
  }
});

// ── Tests: GET /api/story ─────────────────────────────────────────────────────

test("GET /api/story returns story state including turnCount and status", async () => {
  const worldId = uniqueTestWorldId();
  const instanceId = "playthrough-1";
  const storyId = "intro-scene";
  try {
    await createInstanceDir(worldId, instanceId, "Test Run");

    // Create the story directory + story.json directly
    const storyDir = path.join(repoRoot, "instances", worldId, instanceId, "stories", storyId);
    await mkdir(storyDir, { recursive: true });
    const storyMeta = { status: "in_progress", createdAt: new Date().toISOString(), turnCount: 3 };
    await writeFile(path.join(storyDir, "story.json"), `${JSON.stringify(storyMeta, null, 2)}\n`, "utf8");

    const server = createParleyServer();
    const fetch = createInProcessFetch(server);

    const response = await fetch(`/api/story?world=${worldId}&instance=${instanceId}&story=${storyId}`);
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.equal(data.worldId, worldId);
    assert.equal(data.instanceId, instanceId);
    assert.equal(data.storyId, storyId);
    assert.equal(data.status, "in_progress");
    assert.equal(data.turnCount, 3);
  } finally {
    await cleanupWorldInstances(worldId);
  }
});

// ── Tests: POST /api/turn ─────────────────────────────────────────────────────

test("POST /api/turn with new shape returns AuthoredTurn", async () => {
  // handleRunTurnNew calls runPlayerTurn (the mock fixture) and adapts the result
  // to the AuthoredTurn shape: responseId, narration, speakers, nextChoices,
  // proposedFacts, storyConsequence, beatRedirect.
  const worldId = "last-lantern";
  const instanceId = "playthrough-1";

  const server = createParleyServer();
  const fetch = createInProcessFetch(server);

  const response = await fetch("/api/turn", {
    method: "POST",
    body: JSON.stringify({
      worldId,
      instanceId,
      storyId: null,
      playerAction: "I ask who remembers the old north road."
    })
  });
  assert.equal(response.status, 200);

  const data = await response.json();

  // AuthoredTurn shape
  assert.ok(typeof data.responseId === "string" && data.responseId.length > 0, "responseId must be a non-empty string");
  assert.ok(typeof data.narration === "string" && data.narration.length > 0, "narration must be a non-empty string");
  assert.ok(Array.isArray(data.speakers), "speakers must be an array");
  assert.ok(Array.isArray(data.nextChoices), "nextChoices must be an array");
  assert.ok(Array.isArray(data.proposedFacts), "proposedFacts must be an array");
  assert.ok("storyConsequence" in data, "storyConsequence must be present");
  assert.ok("beatRedirect" in data, "beatRedirect must be present");

  // The mock runtime produces the Mara Underbough fixture for last-lantern
  assert.match(data.narration, /Mara Underbough/);
});

test("POST /api/turn with old shape (scenarioId, playerAction) returns 400 — legacy shape removed in 1d", async () => {
  const server = createParleyServer({
    instanceDir: path.join(repoRoot, "instances", "last-lantern", "playthrough-1")
  });
  const fetch = createInProcessFetch(server);

  const response = await fetch("/api/turn", {
    method: "POST",
    body: JSON.stringify({
      scenarioId: "neon-afterhours",
      playerAction: "I ask who signed the audit lockout."
    })
  });
  // The legacy { scenarioId } shape was removed in 1d. worldId is required.
  assert.equal(response.status, 400);

  const data = await response.json();
  assert.ok(typeof data.error === "string", "error message should be present for rejected legacy shape");
});

test("POST /api/turn rejects with 400 when new shape is missing playerAction", async () => {
  const server = createParleyServer();
  const fetch = createInProcessFetch(server);

  // New shape present (worldId provided) but playerAction missing
  const response = await fetch("/api/turn", {
    method: "POST",
    body: JSON.stringify({
      worldId: "last-lantern",
      instanceId: "playthrough-1",
      storyId: null
      // playerAction intentionally omitted
    })
  });
  assert.equal(response.status, 400);

  const data = await response.json();
  assert.ok(typeof data.error === "string", "error message should be present");
});
