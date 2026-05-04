#!/usr/bin/env node
/**
 * smoke-parley-e2e.mjs — Parley server API smoke test.
 *
 * Updated in 1d: removed tests against old src/client/ (deleted) and /api/scenarios.
 * Now tests the new API surface: /api/worlds, /api/instances, /api/stories, /api/turn (new shape).
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";

import { createParleyServer } from "../src/server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let instanceDir;
let worldDir;
const originalFetch = globalThis.fetch;

async function main() {
  const runtimeDir = await mkdtemp(path.join(tmpdir(), "parley-e2e-"));
  instanceDir = path.join(runtimeDir, "instance");
  worldDir = path.join(runtimeDir, "world");
  await mkdir(instanceDir, { recursive: true });
  await Promise.all([
    rm(path.join(instanceDir, "world-state.json"), { force: true }),
    rm(path.join(instanceDir, "turns.jsonl"), { force: true }),
    rm(path.join(instanceDir, "truth-verdicts.jsonl"), { force: true })
  ]);

  const server = createParleyServer({ instanceDir, worldDir });
  const serverFetch = createInProcessFetch(server);

  // /api/worlds should return the installed world summaries
  const worldsResponse = await serverFetch("/api/worlds");
  assert.equal(worldsResponse.status, 200, "/api/worlds should return 200");
  const worldsData = await worldsResponse.json();
  assert.ok(Array.isArray(worldsData.worlds), "worlds should be an array");
  assert.ok(worldsData.worlds.length >= 1, "at least one world should be installed");

  const lastLantern = worldsData.worlds.find((w) => w.id === "last-lantern");
  assert.ok(lastLantern, "last-lantern world should be present");
  assert.equal(lastLantern.name, "Last Lantern");

  // /api/scenarios removed in 1d — must 404
  const scenariosResponse = await serverFetch("/api/scenarios");
  assert.equal(scenariosResponse.status, 404, "/api/scenarios should be gone (404)");

  // /api/state removed in 1d — must 404
  const stateResponse = await serverFetch("/api/state?scenario=last-lantern");
  assert.equal(stateResponse.status, 404, "/api/state should be gone (404)");

  // POST /api/turn with old shape { scenarioId } must return 400
  const legacyTurnResponse = await serverFetch("/api/turn", {
    method: "POST",
    body: JSON.stringify({
      scenarioId: "last-lantern",
      playerAction: "I ask who remembers the old north road."
    })
  });
  assert.equal(legacyTurnResponse.status, 400, "Legacy turn shape should be rejected with 400");

  // Create an instance and run a turn via the new shape
  const instanceResponse = await serverFetch("/api/instances", {
    method: "POST",
    body: JSON.stringify({ worldId: "last-lantern" })
  });
  assert.equal(instanceResponse.status, 200, "/api/instances POST should return 200");
  const instance = await instanceResponse.json();
  assert.ok(instance.instanceId, "instance should have an instanceId");
  assert.ok(/^playthrough-\d+$/.test(instance.instanceId), "instanceId should match playthrough-N pattern");

  // Create a story instance
  const storyResponse = await serverFetch("/api/stories", {
    method: "POST",
    body: JSON.stringify({
      worldId: "last-lantern",
      instanceId: instance.instanceId,
      storyTemplateId: "last-lantern"
    })
  });
  assert.equal(storyResponse.status, 200, "/api/stories POST should return 200");
  const story = await storyResponse.json();
  assert.equal(story.status, "in_progress");

  // POST /api/turn with new shape { worldId, instanceId, storyId, playerAction }
  const turnResponse = await serverFetch("/api/turn", {
    method: "POST",
    body: JSON.stringify({
      worldId: "last-lantern",
      instanceId: instance.instanceId,
      storyId: story.storyId,
      playerAction: "I ask who remembers the old north road."
    })
  });
  assert.equal(turnResponse.status, 200, "New turn shape should return 200");
  const turn = await turnResponse.json();
  assert.ok(turn.narration, "turn should have narration");
  assert.match(turn.narration, /Mara Underbough/);
  assert.ok(Array.isArray(turn.nextChoices), "turn should have nextChoices");

  // Verify the story's turnCount was updated
  const storyFetchResponse = await serverFetch(
    `/api/story?world=last-lantern&instance=${instance.instanceId}&story=${story.storyId}`
  );
  assert.equal(storyFetchResponse.status, 200, "/api/story GET should return 200");
  const updatedStory = await storyFetchResponse.json();
  assert.equal(updatedStory.turnCount, 1, "story turnCount should be 1 after one turn");

  // Test PATCH /api/instances (rename)
  const renameResponse = await serverFetch(
    `/api/instances/last-lantern/${instance.instanceId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ displayName: "My Epic Playthrough" })
    }
  );
  assert.equal(renameResponse.status, 200, "PATCH rename should return 200");
  const renamed = await renameResponse.json();
  assert.equal(renamed.displayName, "My Epic Playthrough");

  // Test DELETE /api/instances
  const deleteResponse = await serverFetch(
    `/api/instances/last-lantern/${instance.instanceId}`,
    { method: "DELETE" }
  );
  assert.equal(deleteResponse.status, 200, "DELETE instance should return 200");

  console.log("Parley narrative e2e smoke");
  console.log("");
  console.log("Checks:");
  for (const check of [
    "/api/worlds returns installed worlds",
    "/api/scenarios removed — returns 404",
    "/api/state removed — returns 404",
    "POST /api/turn with legacy { scenarioId } shape returns 400",
    "POST /api/instances creates playthrough-N instance",
    "POST /api/stories creates in_progress story",
    "POST /api/turn (new shape) runs turn + returns narration",
    "/api/story GET returns updated turnCount",
    "PATCH /api/instances renames display name",
    "DELETE /api/instances removes instance",
  ]) {
    console.log(`- ${check}`);
  }
}

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
      headers: {
        get(name) {
          return response.headers[name.toLowerCase()] ?? null;
        }
      },
      async text() {
        return response.body;
      },
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
    headers: response.headers,
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
      Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
    );
    return this;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }
}

await main();
