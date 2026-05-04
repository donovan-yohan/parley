import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCurrentState, runPlayerTurn } from "./runtime/parleyRuntime.js";
import { defaultScenarioId, listScenarioPacks, loadScenarioPack } from "./runtime/scenarioPacks.js";
import { subscribe } from "./runtime/events/sseBroadcaster.js";
import {
  ensureSession,
  registerAgent,
} from "./runtime/belayer/sessionManager.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(root, "src", "client");
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";
const maxJsonBodyBytes = 1_000_000;

// ---------------------------------------------------------------------------
// Instance detection helpers
// ---------------------------------------------------------------------------

/**
 * Check if a materialized instance exists for the given world ID.
 * Returns the instance manifest (parsed) if found, or null if not.
 *
 * Looks for: instances/<worldId>/<worldId>-default/manifest.json
 *
 * @param {string} worldId
 * @returns {Promise<object|null>}
 */
async function findDefaultInstance(worldId) {
  const instanceDir = path.join(root, "instances", worldId, `${worldId}-default`);
  const manifestPath = path.join(instanceDir, "manifest.json");
  try {
    await stat(manifestPath);
    const raw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    return { manifest, instanceDir };
  } catch {
    return null;
  }
}

/**
 * Lazy-load the Zod runtime validators.
 * Server.js is loaded via `node --import tsx src/server.js` so tsx is active
 * and the .ts imports inside runtime-validators.mjs will resolve correctly.
 *
 * Falls back to null if tsx is not active (test environments inject their own
 * validators via runtimeOptions).
 */
let _cachedValidators = null;
async function getValidators() {
  if (_cachedValidators) return _cachedValidators;
  try {
    const mod = await import("./contracts/runtime-validators.mjs");
    _cachedValidators = mod.validators;
  } catch {
    // tsx not active — callers must inject validators via runtimeOptions
    _cachedValidators = null;
  }
  return _cachedValidators;
}

// Character roles that are always registered in a live session.
// The user must list these in their Belayer climb config for auto-spawn;
// Parley calls registerAgent to track them in the session roster.
const SYSTEM_AGENTS = ["storyteller", "truth-judge", "background-artist", "portrait-artist"];

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
      const scenarioId = body.scenarioId ?? runtimeOptions.scenarioId ?? defaultScenarioId;

      // ── Live-mode detection ─────────────────────────────────────────────────
      // Check if a default instance is materialized for this world.
      // If yes: use live Belayer storyteller + truth-judge.
      // If no: fall back to legacy mock path.
      const instanceInfo = runtimeOptions.instanceDir
        ? null  // instanceDir explicitly provided — caller controls live mode
        : await findDefaultInstance(scenarioId);

      let liveOptions = {};
      if (instanceInfo && !runtimeOptions.disableLiveMode) {
        const { manifest, instanceDir } = instanceInfo;
        const worldInstanceId = manifest.instance_id ?? manifest.crag_slug;
        // storyId = scenarioId for now; multi-story-per-instance is follow-up.
        const storyId = scenarioId;
        const cragSlug = manifest.crag_slug;

        // Ensure a Belayer climb session is alive (idempotent).
        // Errors here (daemon down, profile budget) propagate to the client.
        try {
          const validators = runtimeOptions._validators ?? await getValidators();

          await ensureSession({
            worldInstanceId,
            storyId,
            cragSlug,
            supervisorTalent: "storyteller",
            workdir: instanceDir,
            initialTask: `Parley story instance: ${worldInstanceId} / ${storyId}`,
            ...(runtimeOptions._ensureSessionDeps ?? {}),
          });

          // Register system agents + any characters from the manifest.
          // Actual spawn happens via the user's Belayer climb config.
          for (const agentName of SYSTEM_AGENTS) {
            try {
              registerAgent({ worldInstanceId, storyId, agentName });
            } catch {
              // registerAgent throws if session not found — already established above.
              // Swallow individual registration errors; session is the gate.
            }
          }

          liveOptions = {
            instanceDir,
            useLiveAuthor: true,
            useLiveTruthJudge: true,
            wakeResumableNpcs: true,
            wakeValidationDeps: validators
              ? { validateWake: validators.validateWake, validateWakeResult: validators.validateWakeResult }
              : null,
          };
        } catch (liveErr) {
          // If session establishment fails (daemon down, etc.), surface actionable error.
          const actionableMessage =
            liveErr.name === "BelayerDaemonNotRunningError"
              ? liveErr.message
              : `Live session setup failed: ${liveErr.message}. ` +
                `Run \`npm run instance:materialize -- --world ${scenarioId} --as ${scenarioId}-default\` first.`;
          const err = new Error(actionableMessage);
          err.statusCode = 503;
          throw err;
        }
      }

      const result = await runPlayerTurn({
        ...runtimeOptions,
        ...liveOptions,
        scenarioId,
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
