import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { narrowToolBundle } from "../../src/runtime/tools/narrowToolBundle.js";
import { loadCatalog } from "../../src/runtime/tools/loadCatalog.js";

const catalog = loadCatalog();

// ---------------------------------------------------------------------------
// Authority-based narrowing
// ---------------------------------------------------------------------------
describe("narrowToolBundle — authority filtering", () => {
  it("actor character gets all actor + lifecycle tools, NO gm-only or validator-only", () => {
    const bundle = narrowToolBundle({ catalog, characterAuthority: "actor" });
    const names = bundle.map((t) => t.name);

    // Must include actor tools
    assert.ok(names.includes("speak"), "actor should have speak");
    assert.ok(names.includes("remember_private"), "actor should have remember_private");
    assert.ok(names.includes("deflect"), "actor should have deflect");
    assert.ok(names.includes("wake_done"), "actor should have wake_done");
    assert.ok(names.includes("wake_abort"), "actor should have wake_abort");

    // Must NOT include gm-only
    assert.ok(!names.includes("propose_fact"), "actor must NOT have propose_fact (gm-only)");
    assert.ok(!names.includes("record_consequence"), "actor must NOT have record_consequence (gm-only)");

    // Must NOT include validator-only
    assert.ok(!names.includes("reject_claim"), "actor must NOT have reject_claim (validator-only)");

    // All returned tools must have allowed authority
    for (const tool of bundle) {
      assert.ok(
        ["actor", "lifecycle"].includes(tool.authority),
        `actor bundle must not contain authority=${tool.authority} (tool: ${tool.name})`
      );
    }
  });

  it("gm character gets actor + gm-only + lifecycle tools, NO validator-only", () => {
    const bundle = narrowToolBundle({ catalog, characterAuthority: "gm" });
    const names = bundle.map((t) => t.name);

    assert.ok(names.includes("speak"), "gm should have speak");
    assert.ok(names.includes("propose_fact"), "gm should have propose_fact");
    assert.ok(names.includes("record_consequence"), "gm should have record_consequence");
    assert.ok(names.includes("wake_done"), "gm should have wake_done");

    assert.ok(!names.includes("reject_claim"), "gm must NOT have reject_claim (validator-only)");

    for (const tool of bundle) {
      assert.ok(
        ["actor", "gm-only", "lifecycle"].includes(tool.authority),
        `gm bundle must not contain authority=${tool.authority} (tool: ${tool.name})`
      );
    }
  });

  it("validator character gets actor + validator-only + lifecycle tools, NO gm-only", () => {
    const bundle = narrowToolBundle({ catalog, characterAuthority: "validator" });
    const names = bundle.map((t) => t.name);

    assert.ok(names.includes("speak"), "validator should have speak");
    assert.ok(names.includes("reject_claim"), "validator should have reject_claim");
    assert.ok(names.includes("wake_done"), "validator should have wake_done");

    assert.ok(!names.includes("propose_fact"), "validator must NOT have propose_fact (gm-only)");

    for (const tool of bundle) {
      assert.ok(
        ["actor", "validator-only", "lifecycle"].includes(tool.authority),
        `validator bundle must not contain authority=${tool.authority} (tool: ${tool.name})`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// allowedTools intersect narrowing
// ---------------------------------------------------------------------------
describe("narrowToolBundle — allowedTools intersect", () => {
  it("actor with allowedTools=['speak','emote'] returns only those two", () => {
    const bundle = narrowToolBundle({
      catalog,
      characterAuthority: "actor",
      allowedTools: ["speak", "emote"]
    });
    assert.equal(bundle.length, 2);
    const names = bundle.map((t) => t.name);
    assert.ok(names.includes("speak"));
    assert.ok(names.includes("emote"));
  });

  it("actor with single allowedTools entry returns only that tool", () => {
    const bundle = narrowToolBundle({
      catalog,
      characterAuthority: "actor",
      allowedTools: ["wake_done"]
    });
    assert.equal(bundle.length, 1);
    assert.equal(bundle[0].name, "wake_done");
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------
describe("narrowToolBundle — error cases", () => {
  it("actor with allowedTools containing a gm-only tool throws with tool name in message", () => {
    assert.throws(
      () =>
        narrowToolBundle({
          catalog,
          characterAuthority: "actor",
          allowedTools: ["propose_fact"]
        }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("propose_fact"),
          `expected "propose_fact" in: ${err.message}`
        );
        return true;
      }
    );
  });

  it("actor with allowedTools containing a validator-only tool throws", () => {
    assert.throws(
      () =>
        narrowToolBundle({
          catalog,
          characterAuthority: "actor",
          allowedTools: ["reject_claim"]
        }),
      /reject_claim/
    );
  });

  it("unknown tool name in allowedTools throws", () => {
    assert.throws(
      () =>
        narrowToolBundle({
          catalog,
          characterAuthority: "actor",
          allowedTools: ["nonexistent_tool"]
        }),
      /nonexistent_tool/
    );
  });

  it("unknown characterAuthority throws", () => {
    assert.throws(
      () =>
        narrowToolBundle({
          catalog,
          characterAuthority: "pirate"
        }),
      /unknown characterAuthority.*pirate/
    );
  });
});
