import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCurrentState, runPlayerTurn } from "./runtime/parleyRuntime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(root, "src", "client");
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";
const maxJsonBodyBytes = 1_000_000;

export function createParleyServer() {
  return createServer(handleParleyRequest);
}

export async function handleParleyRequest(request, response) {
  try {
    if (request.method === "GET" && request.url === "/api/state") {
      return sendJson(response, await loadCurrentState());
    }

    if (request.method === "POST" && request.url === "/api/turn") {
      const body = await readJsonBody(request);
      const result = await runPlayerTurn({ playerAction: body.playerAction });
      return sendJson(response, result);
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
    console.log(`Parley Last Lantern app running at http://${host}:${port}`);
  });
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
  return "text/html; charset=utf-8";
}
