/**
 * demo-cleanup.test.js — Verify demo-era artifacts are removed.
 *
 * Checks:
 * - GET /api/scenarios returns 404
 * - POST /api/turn with { scenarioId, playerAction } returns 400
 * - src/client/ directory is absent on the filesystem
 * - GET /api/state returns 404
 */

import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";

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

describe("Demo cleanup — removed endpoints", () => {
  let server;
  let fetch;

  before(() => {
    server = createParleyServer();
    fetch = createInProcessFetch(server);
  });

  test("GET /api/scenarios returns 404 — endpoint removed in 1d", async () => {
    const response = await fetch("/api/scenarios");
    assert.equal(response.status, 404, "/api/scenarios should be removed and return 404");
  });

  test("GET /api/state returns 404 — endpoint removed in 1d", async () => {
    const response = await fetch("/api/state?scenario=last-lantern");
    assert.equal(response.status, 404, "/api/state should be removed and return 404");
  });

  test("GET /api/state without params also returns 404", async () => {
    const response = await fetch("/api/state");
    assert.equal(response.status, 404, "/api/state should be removed entirely");
  });

  test("POST /api/turn with { scenarioId, playerAction } returns 400 — legacy shape rejected", async () => {
    const response = await fetch("/api/turn", {
      method: "POST",
      body: JSON.stringify({
        scenarioId: "last-lantern",
        playerAction: "I ask who remembers the old north road."
      })
    });
    assert.equal(response.status, 400, "legacy {scenarioId} shape should return 400");
    const data = await response.json();
    assert.ok(data.error, "error message should be present");
    assert.ok(data.error.includes("worldId"), "error should indicate worldId is required");
  });

  test("POST /api/turn with only playerAction (no worldId) also returns 400", async () => {
    const response = await fetch("/api/turn", {
      method: "POST",
      body: JSON.stringify({
        playerAction: "I do something."
      })
    });
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.ok(data.error, "error message should be present");
  });

  test("POST /api/turn with new shape { worldId, instanceId, storyId, playerAction } still works", async () => {
    // First create an instance and story
    const instResp = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId: "last-lantern" })
    });
    const inst = await instResp.json();

    await fetch("/api/stories", {
      method: "POST",
      body: JSON.stringify({
        worldId: "last-lantern",
        instanceId: inst.instanceId,
        storyTemplateId: "last-lantern"
      })
    });

    const turnResp = await fetch("/api/turn", {
      method: "POST",
      body: JSON.stringify({
        worldId: "last-lantern",
        instanceId: inst.instanceId,
        storyId: "last-lantern",
        playerAction: "I ask who remembers the old north road."
      })
    });
    assert.equal(turnResp.status, 200, "new turn shape should still work");
    const turn = await turnResp.json();
    assert.ok(turn.narration, "should return narration");

    // Clean up
    await fetch(`/api/instances/last-lantern/${inst.instanceId}`, { method: "DELETE" });
  });
});

describe("Demo cleanup — filesystem artifacts removed", () => {
  test("src/client/ directory is absent", async () => {
    const clientDir = path.join(repoRoot, "src", "client");
    let exists = false;
    try {
      await access(clientDir, constants.F_OK);
      exists = true;
    } catch {
      exists = false;
    }
    assert.equal(exists, false, "src/client/ should not exist — it was removed in 1d");
  });

  test("src/client/app.js is absent", async () => {
    const appJs = path.join(repoRoot, "src", "client", "app.js");
    let exists = false;
    try {
      await access(appJs, constants.F_OK);
      exists = true;
    } catch {
      exists = false;
    }
    assert.equal(exists, false, "src/client/app.js should not exist");
  });

  test("src/client/index.html is absent", async () => {
    const indexHtml = path.join(repoRoot, "src", "client", "index.html");
    let exists = false;
    try {
      await access(indexHtml, constants.F_OK);
      exists = true;
    } catch {
      exists = false;
    }
    assert.equal(exists, false, "src/client/index.html should not exist");
  });

  test("src/shell/ still exists (not accidentally deleted)", async () => {
    const shellDir = path.join(repoRoot, "src", "shell");
    let exists = false;
    try {
      await access(shellDir, constants.F_OK);
      exists = true;
    } catch {
      exists = false;
    }
    assert.equal(exists, true, "src/shell/ should still exist");
  });

  test("src/shell/SinglePageApp.tsx is absent — replaced by router-driven App", async () => {
    const spaFile = path.join(repoRoot, "src", "shell", "SinglePageApp.tsx");
    let exists = false;
    try {
      await access(spaFile, constants.F_OK);
      exists = true;
    } catch {
      exists = false;
    }
    assert.equal(exists, false, "SinglePageApp.tsx should have been deleted in 1d");
  });
});
