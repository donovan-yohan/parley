import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, getToolByName } from "../../src/runtime/tools/loadCatalog.js";
import { ToolCatalogSchema } from "../../src/contracts/toolCatalog.ts";

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------
describe("loadCatalog — schema validation", () => {
  it("catalog.json validates against ToolCatalogSchema when validator is injected", () => {
    assert.doesNotThrow(() => {
      loadCatalog({ validateCatalog: (data) => ToolCatalogSchema.parse(data) });
    });
  });

  it("loadCatalog without validator still returns an array", () => {
    const catalog = loadCatalog();
    assert.ok(Array.isArray(catalog));
    assert.ok(catalog.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Catalog completeness — all 19 expected tools present
// ---------------------------------------------------------------------------
const EXPECTED_TOOLS = [
  { name: "speak",              authority: "actor",          write_path: "instance-public" },
  { name: "emote",              authority: "actor",          write_path: "instance-public" },
  { name: "move",               authority: "actor",          write_path: "instance-public" },
  { name: "set_activity",       authority: "actor",          write_path: "instance-public" },
  { name: "ask_player",         authority: "actor",          write_path: "instance-public" },
  { name: "remember_private",   authority: "actor",          write_path: "profile-private" },
  { name: "remember_public",    authority: "actor",          write_path: "instance-public" },
  { name: "update_relationship",authority: "actor",          write_path: "instance-public" },
  { name: "set_intention",      authority: "actor",          write_path: "profile-private" },
  { name: "revise_belief",      authority: "actor",          write_path: "profile-private" },
  { name: "surface_lead",       authority: "actor",          write_path: "instance-public" },
  { name: "create_rumor",       authority: "actor",          write_path: "instance-public" },
  { name: "propose_fact",       authority: "gm-only",        write_path: "instance-public" },
  { name: "record_consequence", authority: "gm-only",        write_path: "instance-public" },
  { name: "request_scene_shift",authority: "actor",          write_path: "instance-public" },
  { name: "reject_claim",       authority: "validator-only", write_path: "none"            },
  { name: "deflect",            authority: "actor",          write_path: "none"            },
  { name: "wake_done",          authority: "lifecycle",      write_path: "none"            },
  { name: "wake_abort",         authority: "lifecycle",      write_path: "none"            }
];

describe("loadCatalog — catalog completeness", () => {
  it("catalog has exactly 19 tools", () => {
    const catalog = loadCatalog();
    assert.equal(catalog.length, 19);
  });

  for (const expected of EXPECTED_TOOLS) {
    it(`tool "${expected.name}" exists with authority="${expected.authority}" and write_path="${expected.write_path}"`, () => {
      const catalog = loadCatalog();
      const tool = catalog.find((t) => t.name === expected.name);
      assert.ok(tool, `tool "${expected.name}" not found in catalog`);
      assert.equal(tool.authority, expected.authority, `authority mismatch for "${expected.name}"`);
      assert.equal(tool.write_path, expected.write_path, `write_path mismatch for "${expected.name}"`);
    });
  }
});

// ---------------------------------------------------------------------------
// getToolByName
// ---------------------------------------------------------------------------
describe("getToolByName", () => {
  it("returns the entry for a known tool name", () => {
    const tool = getToolByName("speak");
    assert.ok(tool, 'expected "speak" entry');
    assert.equal(tool.name, "speak");
    assert.equal(tool.authority, "actor");
  });

  it("returns null for an unknown tool name", () => {
    const tool = getToolByName("ghost");
    assert.equal(tool, null);
  });

  it("returns the entry when validator is injected", () => {
    const tool = getToolByName("wake_done", {
      validateCatalog: (data) => ToolCatalogSchema.parse(data)
    });
    assert.ok(tool);
    assert.equal(tool.name, "wake_done");
    assert.equal(tool.authority, "lifecycle");
  });
});
