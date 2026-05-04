#!/usr/bin/env node
/**
 * smoke-live-api.mjs
 *
 * Live API smoke test — gated on LIVE_API=1 environment variable.
 *
 * What it tests:
 *   1. A default instance is materialized for "last-lantern".
 *   2. The Belayer daemon is running.
 *   3. POST /api/turn returns a non-empty narration (live Belayer storyteller path).
 *
 * Usage:
 *   LIVE_API=1 node scripts/smoke-live-api.mjs
 *
 * Skip conditions (exits 0 cleanly with a SKIP message):
 *   - LIVE_API env var is not set
 *   - Belayer daemon is not running (checked via `belayer daemon status`)
 *
 * Requirements for a passing run:
 *   - `npm run instance:materialize -- --world last-lantern --as last-lantern-default` has been run
 *   - `belayer daemon` is running in another terminal
 *   - The storyteller + truth-judge agents are listed in the Belayer climb config
 */

import assert from "node:assert/strict";
import { stat, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── Gate: LIVE_API=1 ─────────────────────────────────────────────────────────

if (!process.env.LIVE_API) {
  console.log("SKIP: LIVE_API not set. Run with LIVE_API=1 to execute live smoke test.");
  process.exit(0);
}

// ─── Gate: Belayer daemon running ─────────────────────────────────────────────

async function isBelayerRunning() {
  return new Promise((resolve) => {
    const proc = spawn("belayer", ["daemon", "status"], { stdio: "pipe" });
    const chunks = [];
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => chunks.push(c));
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => {
      const output = Buffer.concat(chunks).toString("utf8");
      // Belayer daemon status exits 0 and says "running" when daemon is up.
      resolve(code === 0 && output.includes("running"));
    });
  });
}

const daemonRunning = await isBelayerRunning();
if (!daemonRunning) {
  console.log("SKIP: Belayer daemon is not running. Start it with `belayer daemon` in another terminal.");
  process.exit(0);
}

// ─── Gate: Instance materialized ─────────────────────────────────────────────

const instanceDir = path.join(root, "instances", "last-lantern", "last-lantern-default");
const manifestPath = path.join(instanceDir, "manifest.json");

try {
  await stat(manifestPath);
} catch {
  console.error(
    "FAIL: No materialized instance found at:",
    instanceDir,
    "\nRun: npm run instance:materialize -- --world last-lantern --as last-lantern-default"
  );
  process.exit(1);
}

// ─── Live API smoke ───────────────────────────────────────────────────────────

console.log("smoke:live-api — running live Belayer round-trip...");

// Import server and start it on a random port
const { createParleyServer } = await import("../src/server.js");

const stateDir = await mkdtemp(path.join(tmpdir(), "parley-live-smoke-"));
await mkdir(stateDir, { recursive: true });

const server = createParleyServer({ stateDir });

await new Promise((resolve, reject) => {
  server.listen(0, "127.0.0.1", resolve);
  server.on("error", reject);
});

const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

console.log(`Server listening on ${baseUrl}`);

let exitCode = 0;

try {
  const playerAction = "I look around the tavern and take stock of who's here.";

  console.log(`POST /api/turn — player action: "${playerAction}"`);
  const response = await fetch(`${baseUrl}/api/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerAction }),
  });

  const body = await response.json();

  if (!response.ok) {
    console.error("FAIL: /api/turn returned error status", response.status, body);
    exitCode = 1;
  } else {
    assert.ok(body.narration, "narration should be non-empty");
    assert.ok(body.narration.length > 10, "narration should be meaningful");
    assert.ok(body.committed !== undefined, "should include committed field");

    console.log("PASS: /api/turn returned narration:");
    console.log("  narration:", body.narration.slice(0, 120) + (body.narration.length > 120 ? "..." : ""));
    console.log("  committed:", body.committed);
    console.log("  verdict:", body.truthVerdict?.verdict);
    console.log("smoke:live-api — PASSED");
  }
} catch (err) {
  console.error("FAIL:", err.message);
  exitCode = 1;
} finally {
  server.close();
}

process.exit(exitCode);
