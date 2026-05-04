import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ToolCatalogEntrySchema, ToolCatalogSchema } from "../../src/contracts/toolCatalog.ts";

// ---------------------------------------------------------------------------
// ToolCatalogEntrySchema — positive cases
// ---------------------------------------------------------------------------
describe("ToolCatalogEntrySchema — positive", () => {
  it("accepts a minimal valid entry with all required fields", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "speak",
      authority: "actor",
      write_path: "instance-public",
      description: "Speak dialogue aloud in the scene."
    });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts a valid entry with optional inputs and outputs", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "remember_private",
      authority: "actor",
      write_path: "profile-private",
      description: "Write a private memory entry.",
      inputs: { content: "string" },
      outputs: { ok: "boolean" }
    });
    assert.ok(result.success, JSON.stringify(result));
  });

  it("accepts all valid authority values", () => {
    for (const authority of ["actor", "gm-only", "validator-only", "lifecycle"] as const) {
      const result = ToolCatalogEntrySchema.safeParse({
        name: "test_tool",
        authority,
        write_path: "none",
        description: "A test tool."
      });
      assert.ok(result.success, `authority=${authority} should be valid`);
    }
  });

  it("accepts all valid write_path values", () => {
    for (const write_path of ["profile-private", "instance-public", "none"] as const) {
      const result = ToolCatalogEntrySchema.safeParse({
        name: "test_tool",
        authority: "actor",
        write_path,
        description: "A test tool."
      });
      assert.ok(result.success, `write_path=${write_path} should be valid`);
    }
  });
});

// ---------------------------------------------------------------------------
// ToolCatalogEntrySchema — negative cases
// ---------------------------------------------------------------------------
describe("ToolCatalogEntrySchema — negative", () => {
  it("rejects a tool name with uppercase letters", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "Speak",
      authority: "actor",
      write_path: "instance-public",
      description: "Bad name."
    });
    assert.equal(result.success, false);
  });

  it("rejects a tool name with numbers", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "speak2",
      authority: "actor",
      write_path: "instance-public",
      description: "Bad name."
    });
    assert.equal(result.success, false);
  });

  it("rejects a tool name with hyphens", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "speak-loudly",
      authority: "actor",
      write_path: "instance-public",
      description: "Bad name."
    });
    assert.equal(result.success, false);
  });

  it("rejects a bad authority enum value", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "speak",
      authority: "player",
      write_path: "instance-public",
      description: "Bad authority."
    });
    assert.equal(result.success, false);
  });

  it("rejects a bad write_path enum value", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "speak",
      authority: "actor",
      write_path: "local-disk",
      description: "Bad write_path."
    });
    assert.equal(result.success, false);
  });

  it("rejects an entry missing required description", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "speak",
      authority: "actor",
      write_path: "instance-public"
    });
    assert.equal(result.success, false);
  });

  it("rejects an entry with an empty description", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "speak",
      authority: "actor",
      write_path: "instance-public",
      description: ""
    });
    assert.equal(result.success, false);
  });

  it("rejects an entry with an unknown extra field (strict)", () => {
    const result = ToolCatalogEntrySchema.safeParse({
      name: "speak",
      authority: "actor",
      write_path: "instance-public",
      description: "Fine.",
      extra_field: "bad"
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// ToolCatalogSchema — array-level validation
// ---------------------------------------------------------------------------
describe("ToolCatalogSchema", () => {
  it("accepts an array of valid entries", () => {
    const result = ToolCatalogSchema.safeParse([
      {
        name: "speak",
        authority: "actor",
        write_path: "instance-public",
        description: "Speak."
      },
      {
        name: "wake_done",
        authority: "lifecycle",
        write_path: "none",
        description: "Done."
      }
    ]);
    assert.ok(result.success, JSON.stringify(result));
  });

  it("rejects an empty array (min 1)", () => {
    const result = ToolCatalogSchema.safeParse([]);
    assert.equal(result.success, false);
  });

  it("rejects a non-array value", () => {
    const result = ToolCatalogSchema.safeParse({ name: "speak" });
    assert.equal(result.success, false);
  });

  it("rejects an array containing an invalid entry", () => {
    const result = ToolCatalogSchema.safeParse([
      {
        name: "BadName",
        authority: "actor",
        write_path: "instance-public",
        description: "Bad."
      }
    ]);
    assert.equal(result.success, false);
  });
});
