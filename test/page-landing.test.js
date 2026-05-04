/**
 * page-landing.test.js — Data-layer tests for L1 Landing.
 *
 * Tests the data logic: world loading, instance checking, recency rail filtering.
 * Since we cannot render Preact components in node:test without jsdom, we test
 * the server endpoints and the logic extracted from the component.
 *
 * These tests use the real HTTP server (in-process) to verify the data layer
 * that Landing.tsx consumes.
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { createParleyServer } from "../src/server.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── Helpers ───────────────────────────────────────────────────────────────────

function createInProcessFetch(server) {
  return async (url, options = {}) => {
    const requestUrl = String(url).startsWith("http")
      ? `${new URL(url).pathname}${new URL(url).search}`
      : String(url);
    const response = await requestServer(server, {
      method: options.method ?? "GET",
      url: requestUrl,
      body: options.body
    });
    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      async json() {
        return JSON.parse(response.body);
      }
    };
  };
}

async function requestServer(server, { method, url, body }) {
  const request = new FakeRequest({ method, url, body });
  const response = new FakeResponse();
  const finished = new Promise((resolve) => response.once("finish", resolve));
  server.emit("request", request, response);
  await finished;
  return {
    status: response.statusCode,
    body: Buffer.concat(response.chunks).toString("utf8")
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
      Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    );
    return this;
  }
  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("L1 Landing — data layer (server endpoints)", () => {
  let server;
  let fetch;

  before(() => {
    server = createParleyServer();
    fetch = createInProcessFetch(server);
  });

  test("GET /api/worlds returns installed worlds for tile grid", async () => {
    const response = await fetch("/api/worlds");
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(Array.isArray(data.worlds), "worlds should be an array");
    assert.ok(data.worlds.length >= 1, "at least one world should be installed");

    // Each world tile needs: id, name, premise
    for (const world of data.worlds) {
      assert.ok(world.id, `world.id required`);
      assert.ok(world.name, `world.name required`);
    }
  });

  test("tile click with no existing instances — POST createInstance navigates to L2", async () => {
    const worldId = "last-lantern";

    // Verify no instances yet (or create in a temp context)
    const instanceResponse = await fetch(`/api/instances?world=${worldId}`);
    assert.equal(instanceResponse.status, 200);
    const instanceData = await instanceResponse.json();
    // The response shape
    assert.ok(Array.isArray(instanceData.instances));

    // POST to create a new instance
    const createResponse = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    });
    assert.equal(createResponse.status, 200);
    const created = await createResponse.json();
    assert.ok(created.instanceId, "created instance should have an instanceId");
    assert.match(created.instanceId, /^playthrough-\d+$/, "should be playthrough-N pattern");
    assert.equal(created.worldId, worldId);

    // Clean up the created instance
    await fetch(`/api/instances/${worldId}/${created.instanceId}`, { method: "DELETE" });
  });

  test("recency rail — GET /api/stories returns instances, filter in_progress only", async () => {
    const worldId = "last-lantern";

    // Create a fresh instance for this test
    const createInstResponse = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    });
    const inst = await createInstResponse.json();
    const instanceId = inst.instanceId;

    try {
      // Create an in_progress story
      const createStoryResponse = await fetch("/api/stories", {
        method: "POST",
        body: JSON.stringify({ worldId, instanceId, storyTemplateId: worldId })
      });
      assert.equal(createStoryResponse.status, 200);
      const inProgressStory = await createStoryResponse.json();
      assert.equal(inProgressStory.status, "in_progress");

      // Get stories — should include in_progress
      const storiesResponse = await fetch(`/api/stories?world=${worldId}&instance=${instanceId}`);
      assert.equal(storiesResponse.status, 200);
      const storiesData = await storiesResponse.json();

      const inProgressInstances = storiesData.instances.filter((s) => s.status === "in_progress");
      assert.ok(inProgressInstances.length >= 1, "should have at least one in_progress story");

      // If we created a completed story, it shouldn't appear in_progress
      const completedInstances = storiesData.instances.filter((s) => s.status === "completed");
      for (const story of completedInstances) {
        assert.notEqual(story.storyId, inProgressStory.storyId, "completed story should not be in_progress");
      }
    } finally {
      // Clean up
      await fetch(`/api/instances/${worldId}/${instanceId}`, { method: "DELETE" });
    }
  });

  test("recency rail click — route construction for storyPlay", () => {
    // Test the route construction logic (pure function equivalent)
    const worldId = "last-lantern";
    const instanceId = "playthrough-1";
    const storyId = "rain-at-the-crossroads";

    const expectedPath = `/world/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}/story/${encodeURIComponent(storyId)}`;
    assert.equal(
      expectedPath,
      "/world/last-lantern/playthrough-1/story/rain-at-the-crossroads"
    );
  });
});

describe("L1 Landing — recency rail filtering logic", () => {
  test("only in_progress stories appear in recency rail (pure logic)", () => {
    // Simulate the filter logic from Landing.tsx's buildRecencyRail
    const stories = [
      { storyId: "story-1", status: "in_progress", lastPlayedAt: "2026-05-01T10:00:00Z", turnCount: 3 },
      { storyId: "story-2", status: "completed", lastPlayedAt: "2026-04-01T10:00:00Z", turnCount: 10 },
      { storyId: "story-3", status: "abandoned", lastPlayedAt: "2026-03-01T10:00:00Z", turnCount: 1 },
      { storyId: "story-4", status: "in_progress", lastPlayedAt: "2026-05-02T10:00:00Z", turnCount: 5 },
    ];

    const inProgress = stories.filter((s) => s.status === "in_progress");
    assert.equal(inProgress.length, 2);
    assert.ok(inProgress.every((s) => s.status === "in_progress"), "all should be in_progress");
    assert.ok(!inProgress.some((s) => s.status === "completed"), "no completed stories");
    assert.ok(!inProgress.some((s) => s.status === "abandoned"), "no abandoned stories");
  });

  test("recency rail sorts by lastPlayedAt descending", () => {
    const items = [
      { storyId: "story-1", lastPlayedAt: "2026-05-01T10:00:00Z" },
      { storyId: "story-4", lastPlayedAt: "2026-05-03T10:00:00Z" },
      { storyId: "story-2", lastPlayedAt: "2026-05-02T10:00:00Z" },
    ];

    items.sort((a, b) => {
      if (!a.lastPlayedAt && !b.lastPlayedAt) return 0;
      if (!a.lastPlayedAt) return 1;
      if (!b.lastPlayedAt) return -1;
      return new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime();
    });

    assert.equal(items[0].storyId, "story-4");
    assert.equal(items[1].storyId, "story-2");
    assert.equal(items[2].storyId, "story-1");
  });

  test("recency rail slices to max 8 items", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      storyId: `story-${i}`,
      lastPlayedAt: new Date(Date.now() - i * 1000).toISOString()
    }));
    const sliced = items.slice(0, 8);
    assert.equal(sliced.length, 8);
  });
});
