import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseParleyWorld, ParleyWorldSchema } from "../../src/contracts/world.ts";

const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function readWorldJson(worldId: string): unknown {
  return JSON.parse(
    readFileSync(path.join(repoRoot, "worlds", worldId, "world.json"), "utf8")
  );
}

// ─── Accept shipped world.json files ─────────────────────────────────────────

describe("parley-world/v1 — acceptance", () => {
  test("last-lantern world.json parses successfully", () => {
    const raw = readWorldJson("last-lantern");
    const world = parseParleyWorld(raw);
    assert.equal(world.id, "last-lantern");
    assert.equal(world.schema_version, "parley-world/v1");
    assert.equal(world.name, "Last Lantern");
    assert.ok(Array.isArray(world.scenarios));
    assert.ok(world.scenarios.length > 0);
    // Defaults applied
    assert.equal(world.shell, "default");
    assert.equal(world.theme, "theme.yaml");
  });

  test("neon-afterhours world.json parses successfully", () => {
    const raw = readWorldJson("neon-afterhours");
    const world = parseParleyWorld(raw);
    assert.equal(world.id, "neon-afterhours");
    assert.equal(world.schema_version, "parley-world/v1");
    assert.equal(world.shell, "default");
  });

  test("orchard-welcome world.json parses successfully", () => {
    const raw = readWorldJson("orchard-welcome");
    const world = parseParleyWorld(raw);
    assert.equal(world.id, "orchard-welcome");
    assert.equal(world.schema_version, "parley-world/v1");
    assert.equal(world.shell, "default");
  });
});

// ─── Reject malformed inputs ──────────────────────────────────────────────────

describe("parley-world/v1 — rejection", () => {
  const validBase = {
    schema_version: "parley-world/v1",
    id: "test-world",
    name: "Test World",
    premise: "A test world.",
    tone: "neutral",
    scenarios: ["test-scenario"],
  } as const;

  test("rejects missing schema_version", () => {
    const { schema_version: _, ...without } = validBase;
    const result = ParleyWorldSchema.safeParse(without);
    assert.equal(result.success, false);
  });

  test("rejects wrong schema_version", () => {
    const result = ParleyWorldSchema.safeParse({
      ...validBase,
      schema_version: "parley-world/v2",
    });
    assert.equal(result.success, false);
  });

  test("rejects missing id", () => {
    const { id: _, ...without } = validBase;
    const result = ParleyWorldSchema.safeParse(without);
    assert.equal(result.success, false);
  });

  test("rejects invalid id format — uppercase letters", () => {
    const result = ParleyWorldSchema.safeParse({
      ...validBase,
      id: "LastLantern",
    });
    assert.equal(result.success, false);
  });

  test("rejects invalid id format — leading digit", () => {
    const result = ParleyWorldSchema.safeParse({
      ...validBase,
      id: "1test-world",
    });
    assert.equal(result.success, false);
  });

  test("rejects invalid id format — too long (40 chars)", () => {
    const result = ParleyWorldSchema.safeParse({
      ...validBase,
      id: "a".repeat(40),
    });
    assert.equal(result.success, false);
  });

  test("rejects unknown shell value", () => {
    const result = ParleyWorldSchema.safeParse({
      ...validBase,
      shell: "hybrid",
    });
    assert.equal(result.success, false);
  });

  test("rejects missing name", () => {
    const { name: _, ...without } = validBase;
    const result = ParleyWorldSchema.safeParse(without);
    assert.equal(result.success, false);
  });

  test("rejects missing premise", () => {
    const { premise: _, ...without } = validBase;
    const result = ParleyWorldSchema.safeParse(without);
    assert.equal(result.success, false);
  });

  test("rejects missing tone", () => {
    const { tone: _, ...without } = validBase;
    const result = ParleyWorldSchema.safeParse(without);
    assert.equal(result.success, false);
  });

  test("rejects non-array scenarios", () => {
    const result = ParleyWorldSchema.safeParse({
      ...validBase,
      scenarios: "single-scenario",
    });
    assert.equal(result.success, false);
  });

  test("rejects missing scenarios", () => {
    const { scenarios: _, ...without } = validBase;
    const result = ParleyWorldSchema.safeParse(without);
    assert.equal(result.success, false);
  });
});

// ─── Optional field defaults ──────────────────────────────────────────────────

describe("parley-world/v1 — defaults", () => {
  const minimal = {
    schema_version: "parley-world/v1",
    id: "my-world",
    name: "My World",
    premise: "A minimal world.",
    tone: "neutral",
    scenarios: [],
  } as const;

  test("shell defaults to 'default' when omitted", () => {
    const world = parseParleyWorld(minimal);
    assert.equal(world.shell, "default");
  });

  test("theme defaults to 'theme.yaml' when omitted", () => {
    const world = parseParleyWorld(minimal);
    assert.equal(world.theme, "theme.yaml");
  });

  test("cover is undefined when omitted", () => {
    const world = parseParleyWorld(minimal);
    assert.equal(world.cover, undefined);
  });

  test("accepts shell:custom explicitly", () => {
    const world = parseParleyWorld({ ...minimal, shell: "custom" });
    assert.equal(world.shell, "custom");
  });

  test("accepts layoutVariant", () => {
    const world = parseParleyWorld({ ...minimal, layoutVariant: "noir" });
    assert.equal(world.layoutVariant, "noir");
  });
});
