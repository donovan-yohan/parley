import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ParleyImageWakeResultSchema } from "../../src/contracts/parleyImageWakeResult.ts";

// ---------------------------------------------------------------------------
// Positive: completed with image_markdown
// ---------------------------------------------------------------------------

describe("ParleyImageWakeResultSchema — positive: completed with image_markdown", () => {
  it("accepts a completed result with image_markdown", () => {
    const result = ParleyImageWakeResultSchema.safeParse({
      schema_version: "parley-image-wake-result/v1",
      wake_id: "image-wake-abc123",
      status: "completed",
      image_markdown: "![A misty valley](https://cdn.example.com/images/valley.png)",
    });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts a completed result with image_path instead", () => {
    const result = ParleyImageWakeResultSchema.safeParse({
      schema_version: "parley-image-wake-result/v1",
      wake_id: "image-wake-abc123",
      status: "completed",
      image_path: "/tmp/generated/valley.png",
    });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts a completed result with both image_markdown and image_path", () => {
    const result = ParleyImageWakeResultSchema.safeParse({
      schema_version: "parley-image-wake-result/v1",
      wake_id: "image-wake-abc123",
      status: "completed",
      image_markdown: "![desc](file:///tmp/foo.png)",
      image_path: "/tmp/foo.png",
      duration_ms: 3200,
    });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Positive: deferred with reason
// ---------------------------------------------------------------------------

describe("ParleyImageWakeResultSchema — positive: deferred with reason", () => {
  it("accepts a deferred result with reason", () => {
    const result = ParleyImageWakeResultSchema.safeParse({
      schema_version: "parley-image-wake-result/v1",
      wake_id: "image-wake-abc123",
      status: "deferred",
      reason: "Artist is processing another request",
    });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative: deferred without reason
// ---------------------------------------------------------------------------

describe("ParleyImageWakeResultSchema — negative: deferred without reason", () => {
  it("rejects deferred status with no reason and includes 'deferred' in message", () => {
    const result = ParleyImageWakeResultSchema.safeParse({
      schema_version: "parley-image-wake-result/v1",
      wake_id: "image-wake-abc123",
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
// Negative: completed without image_markdown OR image_path
// ---------------------------------------------------------------------------

describe("ParleyImageWakeResultSchema — negative: completed without image_markdown OR image_path", () => {
  it("rejects completed status with neither image_markdown nor image_path", () => {
    const result = ParleyImageWakeResultSchema.safeParse({
      schema_version: "parley-image-wake-result/v1",
      wake_id: "image-wake-abc123",
      status: "completed",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      assert.ok(
        messages.includes("image_markdown") || messages.includes("image_path"),
        `Expected image_markdown or image_path reference in error, got: ${messages}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Negative: bad status enum
// ---------------------------------------------------------------------------

describe("ParleyImageWakeResultSchema — negative: bad status enum", () => {
  it("rejects an unrecognised status value", () => {
    const result = ParleyImageWakeResultSchema.safeParse({
      schema_version: "parley-image-wake-result/v1",
      wake_id: "image-wake-abc123",
      status: "in_progress",
      image_markdown: "![desc](https://example.com/img.png)",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative: unknown field rejected (.strict())
// ---------------------------------------------------------------------------

describe("ParleyImageWakeResultSchema — negative: unknown field", () => {
  it("rejects a result with an extra unknown field", () => {
    const result = ParleyImageWakeResultSchema.safeParse({
      schema_version: "parley-image-wake-result/v1",
      wake_id: "image-wake-abc123",
      status: "completed",
      image_markdown: "![desc](https://example.com/img.png)",
      unexpected_field: "oops",
    });
    assert.equal(result.success, false);
  });
});
