import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BelayerTalentMetadataSchema } from "../../src/contracts/belayerTalentMetadata.ts";

const valid = {
  profile_name: "blyr-my-crag-my-talent",
  talent_name: "my-talent",
  crag_slug: "my-crag",
  memory_scope: "crag",
  materialized_at: "2026-05-04T00:50:02Z",
};

// ---------------------------------------------------------------------------
// Positive
// ---------------------------------------------------------------------------
describe("BelayerTalentMetadataSchema – valid", () => {
  it("accepts a fully valid belayer talent metadata object", () => {
    const result = BelayerTalentMetadataSchema.safeParse(valid);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts memory_scope 'climb'", () => {
    const result = BelayerTalentMetadataSchema.safeParse({ ...valid, memory_scope: "climb" });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts memory_scope 'talent'", () => {
    const result = BelayerTalentMetadataSchema.safeParse({ ...valid, memory_scope: "talent" });
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative – strict (unknown fields)
// ---------------------------------------------------------------------------
describe("BelayerTalentMetadataSchema – unknown field rejected", () => {
  it("rejects an object with an extra unknown field", () => {
    const result = BelayerTalentMetadataSchema.safeParse({ ...valid, extra_field: "oops" });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – missing required field
// ---------------------------------------------------------------------------
describe("BelayerTalentMetadataSchema – missing required field", () => {
  it("rejects when profile_name is absent", () => {
    const { profile_name, ...rest } = valid;
    const result = BelayerTalentMetadataSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects when talent_name is absent", () => {
    const { talent_name, ...rest } = valid;
    const result = BelayerTalentMetadataSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects when crag_slug is absent", () => {
    const { crag_slug, ...rest } = valid;
    const result = BelayerTalentMetadataSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects when materialized_at is absent", () => {
    const { materialized_at, ...rest } = valid;
    const result = BelayerTalentMetadataSchema.safeParse(rest);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – memory_scope constraints (critical contract pin)
// ---------------------------------------------------------------------------
describe("BelayerTalentMetadataSchema – invalid memory_scope", () => {
  it("rejects memory_scope 'session' (not in enum — critical pin)", () => {
    const result = BelayerTalentMetadataSchema.safeParse({ ...valid, memory_scope: "session" });
    assert.equal(result.success, false);
  });

  it("rejects when memory_scope is absent", () => {
    const { memory_scope, ...rest } = valid;
    const result = BelayerTalentMetadataSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects an arbitrary memory_scope string", () => {
    const result = BelayerTalentMetadataSchema.safeParse({ ...valid, memory_scope: "global" });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – profile_name constraints
// ---------------------------------------------------------------------------
describe("BelayerTalentMetadataSchema – invalid profile_name", () => {
  it("rejects a profile_name of exactly 65 chars (over 64-char budget)", () => {
    // regex: blyr- (5) + 1 mandatory + {0,58} trailing = max 64 chars
    // "blyr-" (5) + 60 chars = 65 total — one over the max
    const longName = "blyr-" + "a".repeat(60);
    assert.equal(longName.length, 65);
    const result = BelayerTalentMetadataSchema.safeParse({ ...valid, profile_name: longName });
    assert.equal(result.success, false);
  });

  it("accepts a profile_name of exactly 64 chars (at budget)", () => {
    // blyr- (5) + 1 mandatory + 58 trailing = 64 total
    const maxName = "blyr-" + "a".repeat(59);
    assert.equal(maxName.length, 64);
    const result = BelayerTalentMetadataSchema.safeParse({ ...valid, profile_name: maxName });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("rejects a profile_name not starting with blyr-", () => {
    const result = BelayerTalentMetadataSchema.safeParse({
      ...valid,
      profile_name: "notblyr-my-crag-my-talent",
    });
    assert.equal(result.success, false);
  });

  it("rejects a profile_name with uppercase letters", () => {
    const result = BelayerTalentMetadataSchema.safeParse({
      ...valid,
      profile_name: "blyr-MyCrag-talent",
    });
    assert.equal(result.success, false);
  });
});
