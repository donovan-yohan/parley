import assert from "node:assert/strict";
import test from "node:test";

import { awaitWakeResponse } from "../../src/runtime/belayer/wakeTimeout.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a pollFn that returns null for the first `nullCount` calls,
 * then returns `response`.
 */
function pollAfterN(nullCount, response) {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls <= nullCount) return null;
    return response;
  };
  fn.callCount = () => calls;
  return fn;
}

/** Build a pollFn that always returns null. */
function alwaysNull() {
  let calls = 0;
  const fn = async () => {
    calls++;
    return null;
  };
  fn.callCount = () => calls;
  return fn;
}

/** Build a pollFn that throws on the first call. */
function throwsOnFirstCall(error) {
  let calls = 0;
  return async () => {
    calls++;
    if (calls === 1) throw error;
    return null;
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("awaitWakeResponse happy path: returns response when pollFn resolves on second poll", async () => {
  const expectedResponse = { status: "wake_received", payload: "hello" };
  // Return null on first call, response on second
  const pollFn = pollAfterN(1, expectedResponse);

  const result = await awaitWakeResponse({
    clientEventId: "evt-001",
    cragSlug: "my-crag",
    timeoutMs: 500,
    pollIntervalMs: 10,
    pollFn,
  });

  assert.deepEqual(result, expectedResponse);
  assert.ok(pollFn.callCount() >= 2, "pollFn should have been called at least twice");
});

test("awaitWakeResponse returns wake_deferred on timeout when pollFn always returns null", async () => {
  const pollFn = alwaysNull();

  const result = await awaitWakeResponse({
    clientEventId: "evt-timeout",
    cragSlug: "my-crag",
    timeoutMs: 50,
    pollIntervalMs: 10,
    pollFn,
  });

  assert.equal(result.status, "wake_deferred");
  assert.equal(result.clientEventId, "evt-timeout");
  assert.equal(result.reason, "timeout");
});

test("awaitWakeResponse: pollFn throw on first call propagates error", async () => {
  const boom = new Error("poll connection refused");
  const pollFn = throwsOnFirstCall(boom);

  await assert.rejects(
    () =>
      awaitWakeResponse({
        clientEventId: "evt-err",
        cragSlug: "my-crag",
        timeoutMs: 500,
        pollIntervalMs: 10,
        pollFn,
      }),
    (err) => {
      assert.equal(err.message, "poll connection refused");
      return true;
    }
  );
});

test("awaitWakeResponse resolves immediately if pollFn returns non-null on first call", async () => {
  const response = { status: "instant" };
  const pollFn = pollAfterN(0, response);

  const result = await awaitWakeResponse({
    clientEventId: "evt-fast",
    cragSlug: "my-crag",
    timeoutMs: 50,
    pollIntervalMs: 10,
    pollFn,
  });

  assert.deepEqual(result, response);
  assert.equal(pollFn.callCount(), 1);
});

test("awaitWakeResponse custom pollIntervalMs respected: ~5 calls in 50ms with 10ms interval", async () => {
  // With 50ms timeout and 10ms poll interval, we expect roughly 4-6 calls
  const pollFn = alwaysNull();
  const start = Date.now();

  await awaitWakeResponse({
    clientEventId: "evt-interval",
    cragSlug: "my-crag",
    timeoutMs: 50,
    pollIntervalMs: 10,
    pollFn,
  });

  const elapsed = Date.now() - start;
  const calls = pollFn.callCount();

  // We should have at least 2 calls and no more than ~10 calls in 50ms
  assert.ok(calls >= 2, `Expected at least 2 calls, got ${calls}`);
  assert.ok(calls <= 10, `Expected at most 10 calls, got ${calls}`);
  // Elapsed should be close to timeoutMs (between 40ms and 200ms with CI slack)
  assert.ok(elapsed >= 40, `Expected elapsed >= 40ms, got ${elapsed}ms`);
});

test("awaitWakeResponse returns wake_deferred with correct clientEventId and reason", async () => {
  const pollFn = alwaysNull();

  const result = await awaitWakeResponse({
    clientEventId: "unique-id-xyz",
    cragSlug: "my-crag",
    timeoutMs: 30,
    pollIntervalMs: 10,
    pollFn,
  });

  assert.equal(result.status, "wake_deferred");
  assert.equal(result.clientEventId, "unique-id-xyz");
  assert.equal(result.reason, "timeout");
});

test("awaitWakeResponse does not swallow errors thrown after first poll", async () => {
  let calls = 0;
  const boom = new Error("transient failure");
  const pollFn = async () => {
    calls++;
    if (calls === 2) throw boom;
    return null;
  };

  await assert.rejects(
    () =>
      awaitWakeResponse({
        clientEventId: "evt-transient",
        cragSlug: "c",
        timeoutMs: 500,
        pollIntervalMs: 10,
        pollFn,
      }),
    (err) => {
      assert.equal(err.message, "transient failure");
      return true;
    }
  );
});
