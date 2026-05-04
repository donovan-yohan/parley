import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ParleyWakeResultSchema } from "../../src/contracts/parleyWakeResult.ts";

// ---------------------------------------------------------------------------
// Shared valid base objects
// ---------------------------------------------------------------------------

const validCompleted = {
  schema_version: "parley-wake-result/v1",
  wake_id: "wake-abc123",
  status: "completed",
} as const;

const validDeferred = {
  schema_version: "parley-wake-result/v1",
  wake_id: "wake-abc123",
  status: "deferred",
  reason: "Actor is processing another wake",
} as const;

const validAborted = {
  schema_version: "parley-wake-result/v1",
  wake_id: "wake-abc123",
  status: "aborted",
  reason: "Scene no longer active",
} as const;

// ---------------------------------------------------------------------------
// Positive: completed status (no reason needed)
// ---------------------------------------------------------------------------

describe("ParleyWakeResultSchema — positive: completed status", () => {
  it("accepts a completed result without reason", () => {
    const result = ParleyWakeResultSchema.safeParse(validCompleted);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts a completed result with optional fields", () => {
    const result = ParleyWakeResultSchema.safeParse({
      ...validCompleted,
      actions: [{ type: "narrate", text: "The hero acts." }],
      duration_ms: 1200,
    });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Positive: deferred with reason
// ---------------------------------------------------------------------------

describe("ParleyWakeResultSchema — positive: deferred with reason", () => {
  it("accepts a deferred result with reason", () => {
    const result = ParleyWakeResultSchema.safeParse(validDeferred);
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Positive: aborted with reason
// ---------------------------------------------------------------------------

describe("ParleyWakeResultSchema — positive: aborted with reason", () => {
  it("accepts an aborted result with reason", () => {
    const result = ParleyWakeResultSchema.safeParse(validAborted);
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative: deferred WITHOUT reason
// ---------------------------------------------------------------------------

describe("ParleyWakeResultSchema — negative: deferred without reason", () => {
  it("rejects deferred status with no reason and includes 'deferred' in message", () => {
    const result = ParleyWakeResultSchema.safeParse({
      schema_version: "parley-wake-result/v1",
      wake_id: "wake-abc123",
      status: "deferred",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      assert.ok(
        messages.includes("deferred"),
        `Expected "deferred" in error message, got: ${messages}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Negative: aborted without reason
// ---------------------------------------------------------------------------

describe("ParleyWakeResultSchema — negative: aborted without reason", () => {
  it("rejects aborted status with no reason", () => {
    const result = ParleyWakeResultSchema.safeParse({
      schema_version: "parley-wake-result/v1",
      wake_id: "wake-abc123",
      status: "aborted",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Positive: wake_deferred with reason (system-level deferral)
// ---------------------------------------------------------------------------

describe("ParleyWakeResultSchema — positive: wake_deferred with reason", () => {
  it("accepts a wake_deferred result with reason", () => {
    const result = ParleyWakeResultSchema.safeParse({
      schema_version: "parley-wake-result/v1",
      wake_id: "wake-abc123",
      status: "wake_deferred",
      reason: "belayer_daemon_not_running",
    });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative: wake_deferred without reason is rejected
// ---------------------------------------------------------------------------

describe("ParleyWakeResultSchema — negative: wake_deferred without reason", () => {
  it("rejects wake_deferred status with no reason", () => {
    const result = ParleyWakeResultSchema.safeParse({
      schema_version: "parley-wake-result/v1",
      wake_id: "wake-abc123",
      status: "wake_deferred",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      assert.ok(
        messages.includes("wake_deferred"),
        `Expected "wake_deferred" in error message, got: ${messages}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Negative: bad status enum value
// ---------------------------------------------------------------------------

describe("ParleyWakeResultSchema — negative: bad status enum value", () => {
  it("rejects an unrecognised status value", () => {
    const result = ParleyWakeResultSchema.safeParse({
      ...validCompleted,
      status: "in_progress",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown field rejected (.strict())
// ---------------------------------------------------------------------------

describe("ParleyWakeResultSchema — negative: unknown field", () => {
  it("rejects a result with an extra unknown field", () => {
    const result = ParleyWakeResultSchema.safeParse({
      ...validCompleted,
      unexpected_field: "oops",
    });
    assert.equal(result.success, false);
  });
});
