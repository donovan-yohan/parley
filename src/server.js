import { createServer } from "node:http";
import { mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCurrentState, runPlayerTurn } from "./runtime/parleyRuntime.js";
import { defaultScenarioId, listScenarioPacks, loadScenarioPack, repoRoot } from "./runtime/scenarioPacks.js";
import { subscribe } from "./runtime/events/sseBroadcaster.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 1d removed src/client/ entirely — the Vite-built shell is now the only UI.
const distDir = path.join(root, "dist");
const clientDir = distDir;
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";
const maxJsonBodyBytes = 1_000_000;

export function createParleyServer(runtimeOptions = {}) {
  return createServer((request, response) => handleParleyRequest(request, response, runtimeOptions));
}

export async function handleParleyRequest(request, response, runtimeOptions = {}) {
  try {
    const requestUrl = new URL(request.url, `http://${host}:${port}`);

    // SSE: GET /events/:storyId
    // Streams story events to subscribed UI clients.
    if (request.method === "GET" && /^\/events\/[a-z0-9-]+$/i.test(requestUrl.pathname)) {
      const storyId = requestUrl.pathname.split("/").pop();
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      response.write(":\n\n"); // initial comment to flush headers
      const heartbeat = setInterval(() => {
        try { response.write("event: ping\ndata: {}\n\n"); } catch {}
      }, 15_000);
      const unsubscribe = subscribe({
        storyId,
        write: (payload) => response.write(payload)
      });
      request.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { response.end(); } catch {}
      });
      return;
    }

    // ── New endpoints (Part 1b) ──────────────────────────────────────────────

    if (request.method === "GET" && requestUrl.pathname === "/api/worlds") {
      return sendJson(response, await handleGetWorlds());
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/instances") {
      const worldId = requestUrl.searchParams.get("world");
      if (!worldId) {
        return sendJson(response, { error: "world query param required" }, 400);
      }
      return sendJson(response, await handleGetInstances(worldId));
    }

    {
      const instanceMatch = requestUrl.pathname.match(/^\/api\/instances\/([^/]+)\/([^/]+)$/);
      if (instanceMatch) {
        const worldId = decodeURIComponent(instanceMatch[1]);
        const instanceId = decodeURIComponent(instanceMatch[2]);

        if (request.method === "GET") {
          const result = await handleGetInstance(worldId, instanceId);
          if (!result) {
            return sendJson(response, { error: "instance not found" }, 404);
          }
          return sendJson(response, result);
        }

        if (request.method === "PATCH") {
          const body = await readJsonBody(request);
          if (!body.displayName) {
            return sendJson(response, { error: "displayName required" }, 400);
          }
          return sendJson(response, await handleRenameInstance(worldId, instanceId, body.displayName));
        }

        if (request.method === "DELETE") {
          await handleDeleteInstance(worldId, instanceId);
          return sendJson(response, { ok: true });
        }
      }
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/instances") {
      const body = await readJsonBody(request);
      if (!body.worldId) {
        return sendJson(response, { error: "worldId required" }, 400);
      }
      return sendJson(response, await handleCreateInstance(body.worldId, body.displayName));
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/stories") {
      const worldId = requestUrl.searchParams.get("world");
      const instanceId = requestUrl.searchParams.get("instance");
      if (!worldId || !instanceId) {
        return sendJson(response, { error: "world and instance query params required" }, 400);
      }
      return sendJson(response, await handleGetStories(worldId, instanceId));
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/stories") {
      const body = await readJsonBody(request);
      if (!body.worldId || !body.instanceId || !body.storyTemplateId) {
        return sendJson(response, { error: "worldId, instanceId, storyTemplateId required" }, 400);
      }
      return sendJson(response, await handleCreateStory(body.worldId, body.instanceId, body.storyTemplateId));
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/story") {
      const worldId = requestUrl.searchParams.get("world");
      const instanceId = requestUrl.searchParams.get("instance");
      const storyId = requestUrl.searchParams.get("story");
      if (!worldId || !instanceId || !storyId) {
        return sendJson(response, { error: "world, instance, story query params required" }, 400);
      }
      return sendJson(response, await handleGetStory(worldId, instanceId, storyId));
    }

    // ── Existing endpoints ───────────────────────────────────────────────────


    if (request.method === "GET" && requestUrl.pathname === "/api/scenarios") {
      return sendJson(response, {
        defaultScenarioId,
        scenarios: await listScenarioPacks()
      });
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/state") {
      return sendJson(response, await loadCurrentState({
        ...runtimeOptions,
        scenarioId: requestUrl.searchParams.get("scenario") ?? runtimeOptions.scenarioId ?? defaultScenarioId
      }));
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/turn") {
      const body = await readJsonBody(request);

      // New shape: { worldId, instanceId, storyId, playerAction }
      if (body.worldId) {
        const result = await handleRunTurnNew(body.worldId, body.instanceId, body.storyId, body.playerAction);
        return sendJson(response, result);
      }

      // Legacy shape: { scenarioId, playerAction } — back-compat until 1d.
      const result = await runPlayerTurn({
        ...runtimeOptions,
        scenarioId: body.scenarioId ?? runtimeOptions.scenarioId ?? defaultScenarioId,
        playerAction: body.playerAction
      });
      return sendJson(response, result);
    }

    if (request.method === "GET" && requestUrl.pathname.startsWith("/world-assets/")) {
      return serveWorldAsset(requestUrl, response, runtimeOptions);
    }

    if (request.method === "GET") {
      return serveStatic(request, response);
    }

    sendJson(response, { error: "Not found" }, 404);
  } catch (error) {
    sendJson(response, { error: error.message }, error.statusCode ?? 500);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createParleyServer();

  server.on("error", (error) => {
    console.error(`Parley server failed to start on ${host}:${port}: ${error.message}`);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`Parley scenario app running at http://${host}:${port}`);
  });
}

// ── New endpoint handlers (Part 1b) ───────────────────────────────────────────

// Strict id pattern shared by every world/instance/story segment that lands in
// a filesystem path. Rejecting `..`, slashes, leading dashes etc. keeps the
// /api/worlds, /api/instances and /api/stories endpoints contained under the
// repo's instances/ and worlds/ trees regardless of caller-supplied input.
const safeIdPattern = /^[a-z0-9][a-z0-9-]*$/;

function validateId(value, label) {
  const id = String(value ?? "").trim();
  if (!safeIdPattern.test(id)) {
    const error = new Error(`${label} must match ${safeIdPattern}`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

async function handleGetWorlds() {
  const worldsDir = path.join(repoRoot, "worlds");
  const entries = await readdir(worldsDir, { withFileTypes: true });
  const worlds = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const worldJsonPath = path.join(worldsDir, entry.name, "world.json");
    let raw;
    try {
      raw = await readFile(worldJsonPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        // Worlds without a world.json are still in-progress stubs (e.g. before
        // 1c lands the schema); skip them quietly.
        continue;
      }
      throw error;
    }
    // Surface JSON parse errors and other fs failures so corrupted content
    // does not silently masquerade as a missing world.
    const world = JSON.parse(raw);
    worlds.push({
      id: world.id,
      name: world.name,
      premise: world.premise ?? "",
      tone: world.tone ?? "",
      cover: world.cover ?? undefined,
      scenarios: Array.isArray(world.scenarios) ? world.scenarios : []
    });
  }
  return { worlds };
}

async function handleGetInstances(worldId) {
  const safeWorldId = validateId(worldId, "worldId");
  const instancesDir = path.join(repoRoot, "instances", safeWorldId);
  let entries;
  try {
    entries = await readdir(instancesDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { instances: [] };
    }
    throw error;
  }
  const instances = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const instanceJsonPath = path.join(instancesDir, entry.name, "instance.json");
    let meta = { displayName: entry.name, createdAt: null, lastPlayedAt: null };
    try {
      const raw = await readFile(instanceJsonPath, "utf8");
      meta = { ...meta, ...JSON.parse(raw) };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
      // No instance.json yet — directory exists pre-first-play.
    }
    instances.push({
      worldId: safeWorldId,
      instanceId: entry.name,
      displayName: meta.displayName ?? entry.name,
      createdAt: meta.createdAt ?? new Date(0).toISOString(),
      lastPlayedAt: meta.lastPlayedAt ?? null
    });
  }
  return { instances };
}

async function handleGetInstance(worldId, instanceId) {
  const safeWorldId = validateId(worldId, "worldId");
  const safeInstanceId = validateId(instanceId, "instanceId");
  const instanceDir = path.join(repoRoot, "instances", safeWorldId, safeInstanceId);
  const instanceJsonPath = path.join(instanceDir, "instance.json");
  let meta = { displayName: safeInstanceId, createdAt: null, lastPlayedAt: null };
  try {
    await readdir(instanceDir);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  try {
    const raw = await readFile(instanceJsonPath, "utf8");
    meta = { ...meta, ...JSON.parse(raw) };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    // instance.json missing — directory exists but unmaterialized; use defaults
  }
  return {
    worldId: safeWorldId,
    instanceId: safeInstanceId,
    displayName: meta.displayName ?? safeInstanceId,
    createdAt: meta.createdAt ?? new Date(0).toISOString(),
    lastPlayedAt: meta.lastPlayedAt ?? null
  };
}

async function handleCreateInstance(worldId, displayName) {
  const safeWorldId = validateId(worldId, "worldId");
  const instancesDir = path.join(repoRoot, "instances", safeWorldId);
  await mkdir(instancesDir, { recursive: true });
  // Race-safe allocation: scan for the next free `playthrough-N`, then attempt
  // a non-recursive `mkdir`. If two concurrent requests collide, EEXIST forces
  // the loser to retry with the next number rather than silently sharing a
  // directory and overwriting instance.json.
  let entries = [];
  try {
    entries = await readdir(instancesDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  const existingNumbers = entries
    .filter((entry) => entry.isDirectory() && /^playthrough-\d+$/.test(entry.name))
    .map((entry) => Number(entry.name.replace("playthrough-", "")));
  let nextN = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  let instanceDir;
  let instanceId;
  for (let attempt = 0; attempt < 1000; attempt += 1, nextN += 1) {
    instanceId = `playthrough-${nextN}`;
    instanceDir = path.join(instancesDir, instanceId);
    try {
      await mkdir(instanceDir);
      break;
    } catch (error) {
      if (error?.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }
  if (!instanceDir) {
    throw new Error("could not allocate a unique instance id");
  }
  const createdAt = new Date().toISOString();
  const instanceMeta = {
    displayName: displayName ?? `Playthrough ${nextN}`,
    createdAt,
    lastPlayedAt: null
  };
  await writeFile(path.join(instanceDir, "instance.json"), `${JSON.stringify(instanceMeta, null, 2)}\n`, "utf8");
  return {
    worldId: safeWorldId,
    instanceId,
    displayName: instanceMeta.displayName,
    createdAt: instanceMeta.createdAt,
    lastPlayedAt: null
  };
}

async function handleRenameInstance(worldId, instanceId, displayName) {
  const instanceDir = path.join(repoRoot, "instances", worldId, instanceId);
  const instanceJsonPath = path.join(instanceDir, "instance.json");
  let meta = { displayName: instanceId, createdAt: null, lastPlayedAt: null };
  try {
    const raw = await readFile(instanceJsonPath, "utf8");
    meta = { ...meta, ...JSON.parse(raw) };
  } catch {
    // Missing instance.json — use defaults
  }
  meta.displayName = displayName;
  await writeFile(instanceJsonPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return { worldId, instanceId, displayName, createdAt: meta.createdAt, lastPlayedAt: meta.lastPlayedAt };
}

async function handleDeleteInstance(worldId, instanceId) {
  const instanceDir = path.join(repoRoot, "instances", worldId, instanceId);
  // Safety: ensure the resolved path is within the instances directory
  const instancesRoot = path.join(repoRoot, "instances");
  const resolved = path.resolve(instanceDir);
  if (!resolved.startsWith(path.resolve(instancesRoot) + path.sep)) {
    const error = new Error("Path traversal detected");
    error.statusCode = 400;
    throw error;
  }
  await rm(resolved, { recursive: true, force: true });
}

async function handleGetStories(worldId, instanceId) {
  const safeWorldId = validateId(worldId, "worldId");
  const safeInstanceId = validateId(instanceId, "instanceId");
  // Templates come from world.json scenarios list
  const worldJsonPath = path.join(repoRoot, "worlds", safeWorldId, "world.json");
  let templates = [];
  try {
    const raw = await readFile(worldJsonPath, "utf8");
    const world = JSON.parse(raw);
    templates = Array.isArray(world.scenarios) ? world.scenarios : [];
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    // No world.json — no templates
  }

  // Story instances live under instances/<worldId>/<instanceId>/stories/
  const storiesDir = path.join(repoRoot, "instances", safeWorldId, safeInstanceId, "stories");
  let storyEntries = [];
  try {
    storyEntries = await readdir(storiesDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    // No stories yet
  }
  const instances = [];
  for (const entry of storyEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const storyJsonPath = path.join(storiesDir, entry.name, "story.json");
    // Surface parse / unreadable errors so corrupted story.json files fail
    // loudly instead of being reported as a silent reset to "in_progress".
    const raw = await readFile(storyJsonPath, "utf8").catch((error) => {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    });
    const parsed = raw ? JSON.parse(raw) : {};
    const storyMeta = { status: "in_progress", turnCount: 0, ...parsed };
    instances.push({
      worldId: safeWorldId,
      instanceId: safeInstanceId,
      storyId: entry.name,
      status: storyMeta.status ?? "in_progress",
      turnCount: storyMeta.turnCount ?? 0
    });
  }
  return { templates, instances };
}

async function handleCreateStory(worldId, instanceId, storyTemplateId) {
  const safeWorldId = validateId(worldId, "worldId");
  const safeInstanceId = validateId(instanceId, "instanceId");
  const safeStoryId = validateId(storyTemplateId, "storyTemplateId");
  const storyDir = path.join(repoRoot, "instances", safeWorldId, safeInstanceId, "stories", safeStoryId);
  const createdAt = new Date().toISOString();
  const storyMeta = { status: "in_progress", createdAt, turnCount: 0 };
  await mkdir(storyDir, { recursive: true });
  await writeFile(path.join(storyDir, "story.json"), `${JSON.stringify(storyMeta, null, 2)}\n`, "utf8");
  return {
    worldId: safeWorldId,
    instanceId: safeInstanceId,
    storyId: safeStoryId,
    status: "in_progress",
    turnCount: 0
  };
}

async function handleGetStory(worldId, instanceId, storyId) {
  const safeWorldId = validateId(worldId, "worldId");
  const safeInstanceId = validateId(instanceId, "instanceId");
  const safeStoryId = validateId(storyId, "storyId");
  const storyJsonPath = path.join(
    repoRoot,
    "instances",
    safeWorldId,
    safeInstanceId,
    "stories",
    safeStoryId,
    "story.json"
  );
  let storyMeta = { status: "in_progress", turnCount: 0 };
  try {
    const raw = await readFile(storyJsonPath, "utf8");
    storyMeta = { ...storyMeta, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code === "ENOENT") {
      const notFound = new Error("Story not found");
      notFound.statusCode = 404;
      throw notFound;
    }
    throw error;
  }
  return {
    worldId: safeWorldId,
    instanceId: safeInstanceId,
    storyId: safeStoryId,
    status: storyMeta.status ?? "in_progress",
    turnCount: storyMeta.turnCount ?? 0
  };
}

async function handleRunTurnNew(worldId, instanceId, storyId, playerAction) {
  if (!playerAction) {
    const error = new Error("playerAction is required");
    error.statusCode = 400;
    throw error;
  }

  // Validate every id segment before it touches the filesystem.
  const safeWorldId = validateId(worldId, "worldId");
  const safeInstanceId = validateId(instanceId ?? "playthrough-1", "instanceId");
  const safeStoryId = storyId ? validateId(storyId, "storyId") : null;
  const instanceDir = path.join(repoRoot, "instances", safeWorldId, safeInstanceId);

  // Route through runPlayerTurn (the mock fixture) with the new instance layout.
  const result = await runPlayerTurn({
    scenarioId: safeWorldId,
    playerAction,
    instanceDir
  });

  // Adapt the raw runtime result to the AuthoredTurn shape defined in agentAuthor.ts.
  const narration = String(result.narration ?? "");
  const nextChoices = Array.isArray(result.nextChoices) ? result.nextChoices : [];
  const proposedFacts = Array.isArray(result.proposedFacts) ? result.proposedFacts : [];
  const rawCharacters = Array.isArray(result.characters) ? result.characters : [];
  const speakers = rawCharacters
    .filter((character) => character.name && narration.includes(character.name))
    .map((character) => ({ characterId: String(character.id ?? character.name), quote: narration }));

  const authoredTurn = {
    responseId: String(result.responseId ?? result.response_id ?? "authored"),
    narration,
    speakers,
    nextChoices,
    proposedFacts,
    storyConsequence: result.storyConsequence ?? null,
    beatRedirect: result.beatRedirect ?? null
  };

  // Only count + timestamp committed turns. runPlayerTurn returns
  // committed: false for revise/fail verdicts and does not append a turn,
  // so bumping turnCount here would let story summaries drift upward even
  // when the runtime rejected the input.
  if (result.committed === true) {
    const playedAt = new Date().toISOString();

    if (safeStoryId) {
      const storyJsonPath = path.join(instanceDir, "stories", safeStoryId, "story.json");
      try {
        const raw = await readFile(storyJsonPath, "utf8");
        const storyMeta = JSON.parse(raw);
        storyMeta.turnCount = (storyMeta.turnCount ?? 0) + 1;
        storyMeta.lastPlayedAt = playedAt;
        await writeFile(storyJsonPath, `${JSON.stringify(storyMeta, null, 2)}\n`, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
        // No story.json yet — nothing to update.
      }
    }

    // Mirror the timestamp onto instance.json so /api/instances no longer
    // reports every playthrough as "never played" after a successful turn.
    const instanceJsonPath = path.join(instanceDir, "instance.json");
    try {
      const raw = await readFile(instanceJsonPath, "utf8");
      const instanceMeta = JSON.parse(raw);
      instanceMeta.lastPlayedAt = playedAt;
      await writeFile(instanceJsonPath, `${JSON.stringify(instanceMeta, null, 2)}\n`, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
      // No instance.json yet — first turn before /api/instances POST. Skip.
    }
  }

  return authoredTurn;
}

// ── Existing helpers ──────────────────────────────────────────────────────────

async function serveWorldAsset(requestUrl, response, runtimeOptions = {}) {
  const scenarioId = requestUrl.searchParams.get("scenario") ?? runtimeOptions.scenarioId ?? defaultScenarioId;
  const scenario = runtimeOptions.worldDir ? null : await loadScenarioPack(scenarioId);
  const worldDir = runtimeOptions.worldDir ?? scenario.worldDir;
  const relativeAssetPath = decodeURIComponent(requestUrl.pathname.slice("/world-assets/".length));
  const filePath = path.resolve(worldDir, relativeAssetPath);
  const assetsDir = path.resolve(worldDir, "assets");

  if (!filePath.startsWith(`${assetsDir}${path.sep}`) || !isWorldImageAsset(filePath)) {
    return sendJson(response, { error: "Not found" }, 404);
  }

  try {
    const [realAssetsDir, realFilePath] = await Promise.all([realpath(assetsDir), realpath(filePath)]);
    if (
      realFilePath === realAssetsDir ||
      !realFilePath.startsWith(`${realAssetsDir}${path.sep}`) ||
      !isWorldImageAsset(realFilePath)
    ) {
      return sendJson(response, { error: "Not found" }, 404);
    }
    const data = await readFile(realFilePath);
    response.writeHead(200, {
      "content-type": contentType(realFilePath),
      "x-content-type-options": "nosniff"
    });
    response.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return sendJson(response, { error: "Not found" }, 404);
    }
    throw error;
  }
}

function isWorldImageAsset(filePath) {
  return /\.(png|jpe?g|webp)$/i.test(filePath);
}

async function serveStatic(request, response) {
  const urlPath = new URL(request.url, `http://localhost:${port}`).pathname;
  const relativePath = urlPath === "/" ? "index.html" : urlPath.slice(1);
  const filePath = path.join(clientDir, relativePath);

  if (!filePath.startsWith(clientDir)) {
    return sendJson(response, { error: "Not found" }, 404);
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, { error: "Not found" }, 404);
      return;
    }
    throw error;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.byteLength ?? Buffer.byteLength(chunk);
    if (size > maxJsonBodyBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function contentType(filePath) {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".png")) {
    return "image/png";
  }
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml; charset=utf-8";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  return "text/html; charset=utf-8";
}
