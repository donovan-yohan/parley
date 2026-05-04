/**
 * wakeNpc.test.js
 *
 * Unit tests for src/runtime/wake/wakeNpc.js.
 * All Belayer side-effects are mocked; Zod parsers are injected via tsx loader.
 *
 * Run via: node --import tsx --test test/wake/wakeNpc.test.js
 * Or via:  node --test  (picked up by glob if tsx loader is active for .ts, but
 *          this file is plain .js so it runs without tsx).
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { wakeNpc } from "../../src/runtime/wake/wakeNpc.js";

// ─── Schema validators (inline minimal versions) ──────────────────────────────
// These mirror what the Zod schemas enforce but are plain JS for the .js test file.
// Tests that want strict Zod enforcement use the tsx contract tests.

/**
 * Minimal ParleyWake validator — checks required fields, throws on missing.
 */
function makeValidateWake() {
  return function validateWake(value) {
    if (!value || typeof value !== "object") throw new Error("ParleyWake: must be object");
    if (value.schema_version !== "parley-wake/v1") throw new Error("ParleyWake: wrong schema_version");
    if (!value.wake_id) throw new Error("ParleyWake: missing wake_id");
    if (!value.crag_slug) throw new Error("ParleyWake: missing crag_slug");
    if (!value.actor_id) throw new Error("ParleyWake: missing actor_id");
    if (!value.scene_id) throw new Error("ParleyWake: missing scene_id");
    if (!value.trigger) throw new Error("ParleyWake: missing trigger");
    if (!value.current_story_context) throw new Error("ParleyWake: missing current_story_context — required by D5 cross-story scoping");
    const ctx = value.current_story_context;
    if (!ctx.story_id) throw new Error("ParleyWake.current_story_context: missing story_id");
    if (!ctx.scene_id) throw new Error("ParleyWake.current_story_context: missing scene_id");
    if (!ctx.current_turn_id) throw new Error("ParleyWake.current_story_context: missing current_turn_id");
    if (!Array.isArray(ctx.present_event_refs)) throw new Error("ParleyWake.current_story_context: present_event_refs must be array");
    return value;
  };
}

/**
 * Minimal ParleyWakeResult validator — checks required fields.
 */
function makeValidateWakeResult() {
  return function validateWakeResult(value) {
    if (!value || typeof value !== "object") throw new Error("ParleyWakeResult: must be object");
    if (value.schema_version !== "parley-wake-result/v1") throw new Error("ParleyWakeResult: wrong schema_version");
    if (!value.wake_id) throw new Error("ParleyWakeResult: missing wake_id");
    if (!["completed", "deferred", "aborted"].includes(value.status)) throw new Error("ParleyWakeResult: invalid status");
    return value;
  };
}

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Create a temp instance dir with a manifest.json.
 */
async function makeInstanceDir({ cragSlug = "test-crag" } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "parley-wake-test-"));
  const manifest = {
    schema_version: "parley-instance-manifest/v1",
    world_id: "last-lantern",
    instance_id: cragSlug,
    crag_slug: cragSlug,
    created_at: new Date().toISOString(),
  };
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return dir;
}

/**
 * Build a minimal valid ParleyWake envelope.
 */
function makeWakeEnvelope({
  wakeId = "wake-001",
  cragSlug = "test-crag",
  characterId = "mara-underbough",
  turnId = "turn-0001",
} = {}) {
  return {
    schema_version: "parley-wake/v1",
    wake_id: wakeId,
    crag_slug: cragSlug,
    actor_id: characterId,
    scene_id: "last-lantern-tavern",
    trigger: "player_turn_completed",
    current_story_context: {
      story_id: "last-lantern",
      scene_id: "last-lantern-tavern",
      current_turn_id: turnId,
      present_event_refs: [],
    },
  };
}

/**
 * Build a valid ParleyWakeResult.
 */
function makeWakeResult({ wakeId = "wake-001" } = {}) {
  return {
    schema_version: "parley-wake-result/v1",
    wake_id: wakeId,
    status: "completed",
    duration_ms: 250,
  };
}

/**
 * Build a mock belayerProcess object.
 */
function makeMockBelayerProcess({
  running = true,
  mailSendResult = { ok: true, messageId: "msg-001", stdout: "", stderr: "" },
  mailSendError = null,
} = {}) {
  const mailSendCalls = [];
  const daemonStatusCalls = [];

  return {
    mailSendCalls,
    daemonStatusCalls,
    async daemonStatus() {
      daemonStatusCalls.push({});
      return { running, stdout: "", stderr: "" };
    },
    async mailSend(opts) {
      mailSendCalls.push(opts);
      if (mailSendError) throw mailSendError;
      return mailSendResult;
    },
  };
}

/**
 * Build a mock awaitWakeResponse function.
 */
function makeMockAwaitWakeResponse(result) {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    return result;
  };
  fn.calls = calls;
  return fn;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("wakeNpc happy round-trip: daemon running → mailSend → response returned", async () => {
  const instanceDir = await makeInstanceDir({ cragSlug: "test-crag" });
  const wakeEnvelope = makeWakeEnvelope({ cragSlug: "test-crag" });
  const wakeResult = makeWakeResult({ wakeId: "wake-001" });

  const belayerProcess = makeMockBelayerProcess({ running: true });
  const awaitWakeResponse = makeMockAwaitWakeResponse(wakeResult);

  const result = await wakeNpc({
    instanceDir,
    characterId: "mara-underbough",
    wakeEnvelope,
    belayerProcess,
    awaitWakeResponse,
    validateWake: makeValidateWake(),
    validateWakeResult: makeValidateWakeResult(),
    timeoutMs: 500,
  });

  // Daemon was checked
  assert.equal(belayerProcess.daemonStatusCalls.length, 1);

  // Mail was sent with correct args
  assert.equal(belayerProcess.mailSendCalls.length, 1);
  const mailCall = belayerProcess.mailSendCalls[0];
  assert.equal(mailCall.cragSlug, "test-crag");
  assert.equal(mailCall.talentName, "mara-underbough");
  assert.equal(mailCall.clientEventId, "wake-001");
  assert.ok(mailCall.body.includes("parley-wake/v1"));

  // awaitWakeResponse was called
  assert.equal(awaitWakeResponse.calls.length, 1);
  assert.equal(awaitWakeResponse.calls[0].clientEventId, "wake-001");
  assert.equal(awaitWakeResponse.calls[0].cragSlug, "test-crag");

  // Result shape is correct
  assert.equal(result.schema_version, "parley-wake-result/v1");
  assert.equal(result.wake_id, "wake-001");
  assert.equal(result.status, "completed");
});

test("wakeNpc idempotent retry: calling twice with same wake_id sends mailSend twice (idempotency on Belayer side)", async () => {
  const instanceDir = await makeInstanceDir({ cragSlug: "test-crag" });
  const wakeEnvelope = makeWakeEnvelope({ wakeId: "wake-idem-001", cragSlug: "test-crag" });
  const wakeResult = makeWakeResult({ wakeId: "wake-idem-001" });

  const belayerProcess = makeMockBelayerProcess({ running: true });
  const awaitWakeResponse = makeMockAwaitWakeResponse(wakeResult);

  // Call twice with same wake_id
  await wakeNpc({
    instanceDir,
    characterId: "mara-underbough",
    wakeEnvelope,
    belayerProcess,
    awaitWakeResponse,
    validateWake: makeValidateWake(),
    validateWakeResult: makeValidateWakeResult(),
    timeoutMs: 500,
  });
  await wakeNpc({
    instanceDir,
    characterId: "mara-underbough",
    wakeEnvelope,
    belayerProcess,
    awaitWakeResponse,
    validateWake: makeValidateWake(),
    validateWakeResult: makeValidateWakeResult(),
    timeoutMs: 500,
  });

  // Both calls go through — idempotency is Belayer's responsibility via client_event_id
  assert.equal(belayerProcess.mailSendCalls.length, 2);
  assert.equal(belayerProcess.mailSendCalls[0].clientEventId, "wake-idem-001");
  assert.equal(belayerProcess.mailSendCalls[1].clientEventId, "wake-idem-001");
});

test("wakeNpc daemon down: returns wake_deferred without calling mailSend", async () => {
  const instanceDir = await makeInstanceDir({ cragSlug: "test-crag" });
  const wakeEnvelope = makeWakeEnvelope({ cragSlug: "test-crag" });

  const belayerProcess = makeMockBelayerProcess({ running: false });
  const awaitWakeResponse = makeMockAwaitWakeResponse(null); // should not be called

  const result = await wakeNpc({
    instanceDir,
    characterId: "mara-underbough",
    wakeEnvelope,
    belayerProcess,
    awaitWakeResponse,
    validateWake: makeValidateWake(),
    validateWakeResult: makeValidateWakeResult(),
    timeoutMs: 500,
  });

  // mailSend MUST NOT be called
  assert.equal(belayerProcess.mailSendCalls.length, 0);
  // awaitWakeResponse MUST NOT be called
  assert.equal(awaitWakeResponse.calls.length, 0);

  // Result is wake_deferred
  assert.equal(result.status, "wake_deferred");
  assert.equal(result.wake_id, "wake-001");
  assert.equal(result.reason, "belayer_daemon_not_running");
});

test("wakeNpc timeout: awaitWakeResponse returns wake_deferred → returned as-is", async () => {
  const instanceDir = await makeInstanceDir({ cragSlug: "test-crag" });
  const wakeEnvelope = makeWakeEnvelope({ cragSlug: "test-crag" });

  const belayerProcess = makeMockBelayerProcess({ running: true });
  const timeoutResult = { status: "wake_deferred", clientEventId: "wake-001", reason: "timeout" };
  const awaitWakeResponse = makeMockAwaitWakeResponse(timeoutResult);

  const result = await wakeNpc({
    instanceDir,
    characterId: "mara-underbough",
    wakeEnvelope,
    belayerProcess,
    awaitWakeResponse,
    validateWake: makeValidateWake(),
    validateWakeResult: makeValidateWakeResult(),
    timeoutMs: 500,
  });

  // mailSend was called (we sent the mail before timing out)
  assert.equal(belayerProcess.mailSendCalls.length, 1);

  // Result is the timeout wake_deferred (not validated — pass through)
  assert.equal(result.status, "wake_deferred");
  assert.equal(result.reason, "timeout");
});

test("wakeNpc crag mismatch: manifest crag != envelope crag → throws", async () => {
  const instanceDir = await makeInstanceDir({ cragSlug: "correct-crag" });
  // Envelope says different crag
  const wakeEnvelope = makeWakeEnvelope({ cragSlug: "wrong-crag" });

  const belayerProcess = makeMockBelayerProcess({ running: true });
  const awaitWakeResponse = makeMockAwaitWakeResponse(null);

  await assert.rejects(
    () =>
      wakeNpc({
        instanceDir,
        characterId: "mara-underbough",
        wakeEnvelope,
        belayerProcess,
        awaitWakeResponse,
        validateWake: makeValidateWake(),
        validateWakeResult: makeValidateWakeResult(),
        timeoutMs: 500,
      }),
    /crag mismatch/
  );

  // Nothing should be sent
  assert.equal(belayerProcess.mailSendCalls.length, 0);
});

test("wakeNpc validation failure: envelope missing current_story_context → validateWake throws → propagates", async () => {
  const instanceDir = await makeInstanceDir({ cragSlug: "test-crag" });
  // Intentionally malformed — missing current_story_context
  const badEnvelope = {
    schema_version: "parley-wake/v1",
    wake_id: "wake-bad",
    crag_slug: "test-crag",
    actor_id: "mara-underbough",
    scene_id: "last-lantern-tavern",
    trigger: "player_turn_completed",
    // current_story_context intentionally omitted
  };

  const belayerProcess = makeMockBelayerProcess({ running: true });
  const awaitWakeResponse = makeMockAwaitWakeResponse(null);

  await assert.rejects(
    () =>
      wakeNpc({
        instanceDir,
        characterId: "mara-underbough",
        wakeEnvelope: badEnvelope,
        belayerProcess,
        awaitWakeResponse,
        validateWake: makeValidateWake(),
        validateWakeResult: makeValidateWakeResult(),
        timeoutMs: 500,
      }),
    /current_story_context/
  );

  // Validation must be the FIRST step — no mail sent
  assert.equal(belayerProcess.daemonStatusCalls.length, 0);
  assert.equal(belayerProcess.mailSendCalls.length, 0);
});

test("wakeNpc wake result validation failure: malformed response from awaitWakeResponse → validateWakeResult throws → propagates", async () => {
  const instanceDir = await makeInstanceDir({ cragSlug: "test-crag" });
  const wakeEnvelope = makeWakeEnvelope({ cragSlug: "test-crag" });

  const belayerProcess = makeMockBelayerProcess({ running: true });
  // Return a malformed result that will fail validateWakeResult
  const malformedResult = { not_a_wake_result: true };
  const awaitWakeResponse = makeMockAwaitWakeResponse(malformedResult);

  await assert.rejects(
    () =>
      wakeNpc({
        instanceDir,
        characterId: "mara-underbough",
        wakeEnvelope,
        belayerProcess,
        awaitWakeResponse,
        validateWake: makeValidateWake(),
        validateWakeResult: makeValidateWakeResult(),
        timeoutMs: 500,
      }),
    /ParleyWakeResult/
  );

  // Mail was sent, wake was awaited — validation only fails at the result step
  assert.equal(belayerProcess.mailSendCalls.length, 1);
  assert.equal(awaitWakeResponse.calls.length, 1);
});

test("wakeNpc default validators throw helpful error if not injected", async () => {
  const instanceDir = await makeInstanceDir({ cragSlug: "test-crag" });
  const wakeEnvelope = makeWakeEnvelope({ cragSlug: "test-crag" });
  const belayerProcess = makeMockBelayerProcess({ running: true });
  const awaitWakeResponse = makeMockAwaitWakeResponse(null);

  // Do not inject validateWake — should throw helpful error
  await assert.rejects(
    () =>
      wakeNpc({
        instanceDir,
        characterId: "mara-underbough",
        wakeEnvelope,
        belayerProcess,
        awaitWakeResponse,
        // validateWake intentionally omitted (defaults to stub)
        timeoutMs: 500,
      }),
    /wakeNpc: pass validateWake/
  );
});
