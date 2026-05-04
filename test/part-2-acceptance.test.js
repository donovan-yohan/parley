import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { ParleyWorldSchema, ParleyThemeSchema } from "../src/contracts/index.ts";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FLAGSHIP_WORLDS = ["verdant-aria", "night-city-after-curfew", "gentle-shore"];

test("all three flagship worlds ship a parley-world/v1 world.json", () => {
  for (const worldId of FLAGSHIP_WORLDS) {
    const worldJsonPath = path.join(repoRoot, "worlds", worldId, "world.json");
    assert.ok(existsSync(worldJsonPath), `world.json missing for ${worldId}`);
    const raw = readFileSync(worldJsonPath, "utf8");
    const parsed = ParleyWorldSchema.parse(JSON.parse(raw));
    assert.equal(parsed.id, worldId);
    assert.equal(parsed.schema_version, "parley-world/v1");
  }
});

test("all three flagship worlds ship a parley-theme/v1 theme.yaml", () => {
  for (const worldId of FLAGSHIP_WORLDS) {
    const themePath = path.join(repoRoot, "worlds", worldId, "theme.yaml");
    assert.ok(existsSync(themePath), `theme.yaml missing for ${worldId}`);
    const raw = readFileSync(themePath, "utf8");
    const parsed = ParleyThemeSchema.parse(parseYaml(raw));
    assert.equal(parsed.schema_version, "parley-theme/v1");
    assert.ok(parsed.palette.background, `${worldId} missing palette.background`);
    assert.ok(parsed.palette.midground, `${worldId} missing palette.midground`);
    assert.ok(parsed.palette.foreground, `${worldId} missing palette.foreground`);
  }
});

test("night-city-after-curfew declares shell: custom", () => {
  const raw = readFileSync(
    path.join(repoRoot, "worlds", "night-city-after-curfew", "world.json"),
    "utf8"
  );
  const world = JSON.parse(raw);
  assert.equal(world.shell, "custom", "expected shell:custom for the rung-6 demo");
});

test("verdant-aria and gentle-shore declare shell: default", () => {
  for (const worldId of ["verdant-aria", "gentle-shore"]) {
    const raw = readFileSync(path.join(repoRoot, "worlds", worldId, "world.json"), "utf8");
    const world = JSON.parse(raw);
    assert.equal(world.shell, "default", `${worldId} should be shell:default`);
  }
});

test("each flagship world ships at least one slot component or custom shell entry", () => {
  for (const worldId of ["verdant-aria", "gentle-shore"]) {
    const slotsPath = path.join(repoRoot, "worlds", worldId, "shell", "slots.tsx");
    assert.ok(existsSync(slotsPath), `${worldId} missing shell/slots.tsx`);
  }
  const customEntry = path.join(repoRoot, "worlds", "night-city-after-curfew", "shell", "entry.tsx");
  assert.ok(existsSync(customEntry), "night-city-after-curfew missing shell/entry.tsx");
});

test("each flagship world ships at least one scenario", () => {
  for (const worldId of FLAGSHIP_WORLDS) {
    const scenariosDir = path.join(repoRoot, "worlds", worldId, "scenarios");
    assert.ok(existsSync(scenariosDir), `${worldId} missing scenarios/`);
  }
});

test("each flagship world ships at least one stylesheet.css", () => {
  for (const worldId of FLAGSHIP_WORLDS) {
    const cssPath = path.join(repoRoot, "worlds", worldId, "stylesheet.css");
    assert.ok(existsSync(cssPath), `${worldId} missing stylesheet.css`);
    const css = readFileSync(cssPath, "utf8");
    assert.ok(css.length > 200, `${worldId} stylesheet.css is suspiciously small`);
  }
});

test("flagship worlds use distinct layoutVariants", () => {
  const variants = new Set();
  for (const worldId of FLAGSHIP_WORLDS) {
    const raw = readFileSync(path.join(repoRoot, "worlds", worldId, "world.json"), "utf8");
    const world = JSON.parse(raw);
    if (world.layoutVariant) {
      variants.add(world.layoutVariant);
    }
  }
  assert.ok(variants.size >= 2, "expected flagship worlds to span multiple layoutVariants");
});
