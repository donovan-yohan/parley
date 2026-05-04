import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ParleyInstanceManifestSchema } from "../../src/contracts/instance.ts";

const valid = {
  schema_version: "parley-instance-manifest/v1",
  world_id: "my-world",
  instance_id: "instance-001",
  crag_slug: "my-crag",
  created_at: "2026-05-04T00:50:02Z",
};

// ---------------------------------------------------------------------------
// Positive
// ---------------------------------------------------------------------------
describe("ParleyInstanceManifestSchema – valid", () => {
  it("accepts a fully valid instance manifest", () => {
    const result = ParleyInstanceManifestSchema.safeParse(valid);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts a manifest with optional default_story_id present", () => {
    const result = ParleyInstanceManifestSchema.safeParse({
      ...valid,
      default_story_id: "story-001",
    });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts a manifest without optional default_story_id", () => {
    const result = ParleyInstanceManifestSchema.safeParse(valid);
    assert.ok(result.success, JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Negative – strict (unknown fields)
// ---------------------------------------------------------------------------
describe("ParleyInstanceManifestSchema – unknown field rejected", () => {
  it("rejects an object with an extra unknown field", () => {
    const result = ParleyInstanceManifestSchema.safeParse({ ...valid, extra_field: "oops" });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – missing required field
// ---------------------------------------------------------------------------
describe("ParleyInstanceManifestSchema – missing required field", () => {
  it("rejects when world_id is absent", () => {
    const { world_id, ...rest } = valid;
    const result = ParleyInstanceManifestSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects when instance_id is absent", () => {
    const { instance_id, ...rest } = valid;
    const result = ParleyInstanceManifestSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects when crag_slug is absent", () => {
    const { crag_slug, ...rest } = valid;
    const result = ParleyInstanceManifestSchema.safeParse(rest);
    assert.equal(result.success, false);
  });

  it("rejects when created_at is absent", () => {
    const { created_at, ...rest } = valid;
    const result = ParleyInstanceManifestSchema.safeParse(rest);
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – instance_id constraints
// ---------------------------------------------------------------------------
describe("ParleyInstanceManifestSchema – invalid instance_id", () => {
  it("rejects an instance_id over 39 chars", () => {
    const result = ParleyInstanceManifestSchema.safeParse({
      ...valid,
      instance_id: "a" + "b".repeat(39),
    });
    assert.equal(result.success, false);
  });

  it("rejects an instance_id starting with a hyphen", () => {
    const result = ParleyInstanceManifestSchema.safeParse({
      ...valid,
      instance_id: "-bad-instance",
    });
    assert.equal(result.success, false);
  });

  it("rejects an instance_id with uppercase letters", () => {
    const result = ParleyInstanceManifestSchema.safeParse({
      ...valid,
      instance_id: "MyInstance",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – crag_slug constraints
// ---------------------------------------------------------------------------
describe("ParleyInstanceManifestSchema – invalid crag_slug", () => {
  it("rejects a crag_slug with uppercase letters", () => {
    const result = ParleyInstanceManifestSchema.safeParse({
      ...valid,
      crag_slug: "MyCrag",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// Negative – wrong schema_version
// ---------------------------------------------------------------------------
describe("ParleyInstanceManifestSchema – wrong schema_version", () => {
  it("rejects a mismatched schema_version", () => {
    const result = ParleyInstanceManifestSchema.safeParse({
      ...valid,
      schema_version: "parley-instance-manifest/v2",
    });
    assert.equal(result.success, false);
  });
});
