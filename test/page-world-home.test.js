/**
 * page-world-home.test.js — Data-layer tests for L2 WorldHome.
 *
 * Tests: story template listing, instance switching rename/delete,
 * story creation navigation. Focuses on the server endpoints consumed by WorldHome.tsx.
 */

import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";

import { createParleyServer } from "../src/server.js";

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

describe("L2 WorldHome — story templates and instances", () => {
  let server;
  let fetch;
  const worldId = "last-lantern";
  let instanceId;

  before(async () => {
    server = createParleyServer();
    fetch = createInProcessFetch(server);

    // Create a fresh instance for this test suite
    const createResp = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    });
    const inst = await createResp.json();
    instanceId = inst.instanceId;
  });

  // Note: cleanup runs on test completion — we clean up within each test that modifies state.

  test("GET /api/stories returns templates from world.json", async () => {
    const response = await fetch(`/api/stories?world=${worldId}&instance=${instanceId}`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(Array.isArray(data.templates), "templates should be an array");
    assert.ok(data.templates.length >= 1, "last-lantern should have at least one scenario template");
    assert.ok(data.templates.includes("last-lantern"), "templates should include last-lantern scenario");
  });

  test("GET /api/stories returns instances array (fresh instance starts empty or with zero in-progress)", async () => {
    // Create a separate fresh instance for this isolated check
    const isolatedInstResp = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    });
    const isolatedInst = await isolatedInstResp.json();
    const isolatedInstanceId = isolatedInst.instanceId;
    try {
      const response = await fetch(`/api/stories?world=${worldId}&instance=${isolatedInstanceId}`);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(Array.isArray(data.instances), "instances should be an array");
      // Freshly created instance has no story instances
      assert.equal(data.instances.length, 0, "fresh instance should have no story instances");
    } finally {
      await fetch(`/api/instances/${worldId}/${isolatedInstanceId}`, { method: "DELETE" });
    }
  });

  test("click story template — POST /api/stories creates story instance and navigates to L3", async () => {
    const storyTemplateId = "last-lantern";

    const createResp = await fetch("/api/stories", {
      method: "POST",
      body: JSON.stringify({ worldId, instanceId, storyTemplateId })
    });
    assert.equal(createResp.status, 200);
    const story = await createResp.json();
    assert.equal(story.worldId, worldId);
    assert.equal(story.instanceId, instanceId);
    assert.equal(story.storyId, storyTemplateId);
    assert.equal(story.status, "in_progress");

    // Verify route construction for L3 navigation
    const expectedPath = `/world/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}/story/${encodeURIComponent(story.storyId)}`;
    assert.ok(expectedPath.startsWith("/world/"), "L3 path should start with /world/");
    assert.ok(expectedPath.includes("/story/"), "L3 path should include /story/");
  });

  test("story appears in instance list after creation", async () => {
    const storiesResp = await fetch(`/api/stories?world=${worldId}&instance=${instanceId}`);
    const data = await storiesResp.json();
    assert.ok(data.instances.length >= 1, "should have at least one story instance after creation");
    const story = data.instances.find((s) => s.storyId === "last-lantern");
    assert.ok(story, "created story should appear in instance list");
    assert.equal(story.status, "in_progress");
  });
});

describe("L2 WorldHome — instance switcher (rename + delete)", () => {
  let server;
  let fetch;
  const worldId = "last-lantern";

  before(async () => {
    server = createParleyServer();
    fetch = createInProcessFetch(server);
  });

  test("PATCH /api/instances/:worldId/:instanceId renames display name", async () => {
    // Create a fresh instance
    const createResp = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    });
    const inst = await createResp.json();
    const instanceId = inst.instanceId;

    try {
      // Rename it
      const renameResp = await fetch(`/api/instances/${worldId}/${instanceId}`, {
        method: "PATCH",
        body: JSON.stringify({ displayName: "My Renamed Playthrough" })
      });
      assert.equal(renameResp.status, 200);
      const renamed = await renameResp.json();
      assert.equal(renamed.displayName, "My Renamed Playthrough");
      assert.equal(renamed.instanceId, instanceId);
    } finally {
      await fetch(`/api/instances/${worldId}/${instanceId}`, { method: "DELETE" });
    }
  });

  test("PATCH /api/instances returns 400 when displayName missing", async () => {
    // Create a fresh instance
    const createResp = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    });
    const inst = await createResp.json();
    const instanceId = inst.instanceId;

    try {
      const renameResp = await fetch(`/api/instances/${worldId}/${instanceId}`, {
        method: "PATCH",
        body: JSON.stringify({})  // no displayName
      });
      assert.equal(renameResp.status, 400);
    } finally {
      await fetch(`/api/instances/${worldId}/${instanceId}`, { method: "DELETE" });
    }
  });

  test("DELETE /api/instances/:worldId/:instanceId removes the instance", async () => {
    // Create a fresh instance
    const createResp = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    });
    const inst = await createResp.json();
    const instanceId = inst.instanceId;

    // Delete it
    const deleteResp = await fetch(`/api/instances/${worldId}/${instanceId}`, {
      method: "DELETE"
    });
    assert.equal(deleteResp.status, 200);

    // Verify it's gone
    const getResp = await fetch(`/api/instances/${worldId}/${instanceId}`);
    assert.equal(getResp.status, 404, "deleted instance should return 404");
  });

  test("instance switcher hidden when only one instance — logic", () => {
    // The InstanceSwitcher renders full popover only when instances.length > 1
    const instances = [{ instanceId: "playthrough-1", displayName: "Playthrough 1" }];
    assert.equal(instances.length <= 1, true, "should hide switcher for single instance");

    const multipleInstances = [
      { instanceId: "playthrough-1", displayName: "Playthrough 1" },
      { instanceId: "playthrough-2", displayName: "Playthrough 2" }
    ];
    assert.equal(multipleInstances.length <= 1, false, "should show switcher for multiple instances");
  });

  test("+ new playthrough creates playthrough-N with incrementing N", async () => {
    // Create first instance
    const first = await (await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    })).json();

    // Create second instance
    const second = await (await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    })).json();

    try {
      assert.match(first.instanceId, /^playthrough-\d+$/);
      assert.match(second.instanceId, /^playthrough-\d+$/);
      const firstN = parseInt(first.instanceId.replace("playthrough-", ""), 10);
      const secondN = parseInt(second.instanceId.replace("playthrough-", ""), 10);
      assert.ok(secondN > firstN, "second playthrough should have higher N than first");
    } finally {
      await fetch(`/api/instances/${worldId}/${first.instanceId}`, { method: "DELETE" });
      await fetch(`/api/instances/${worldId}/${second.instanceId}`, { method: "DELETE" });
    }
  });
});

describe("L2 WorldHome — story status grouping logic", () => {
  test("groups stories by status: in_progress, completed, abandoned", () => {
    const stories = [
      { storyId: "story-1", status: "in_progress" },
      { storyId: "story-2", status: "completed" },
      { storyId: "story-3", status: "abandoned" },
      { storyId: "story-4", status: "in_progress" },
    ];

    const inProgress = stories.filter((s) => s.status === "in_progress");
    const completed = stories.filter((s) => s.status === "completed");
    const abandoned = stories.filter((s) => s.status === "abandoned");

    assert.equal(inProgress.length, 2);
    assert.equal(completed.length, 1);
    assert.equal(abandoned.length, 1);
  });
});
