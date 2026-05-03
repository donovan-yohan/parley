import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCurrentState, runPlayerTurn } from "./runtime/parleyRuntime.js";
import { defaultScenarioId, listScenarioPacks, loadScenarioPack } from "./runtime/scenarioPacks.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(root, "src", "client");
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";
const maxJsonBodyBytes = 1_000_000;

export function createParleyServer(runtimeOptions = {}) {
  return createServer((request, response) => handleParleyRequest(request, response, runtimeOptions));
}

export async function handleParleyRequest(request, response, runtimeOptions = {}) {
  try {
    const requestUrl = new URL(request.url, `http://${host}:${port}`);

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
