import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deriveTokens } from "../src/shell/theme/tokens.ts";

// ─── Fixture palette ──────────────────────────────────────────────────────────

const NOIR_PALETTE = {
  background: "#1a1208",
  midground:  "#3b2f1c",
  foreground: "#f5efe2",
};

const LIGHT_PALETTE = {
  background: "#fef3c7",
  midground:  "#92400e",
  foreground: "#451a03",
};

// ─── Golden tests — noir palette ──────────────────────────────────────────────

describe("deriveTokens — noir palette", () => {
  const tokens = deriveTokens(NOIR_PALETTE);

  test("verbatim input tokens are present", () => {
    assert.equal(tokens["--color-background"], "#1a1208");
    assert.equal(tokens["--color-foreground"], "#f5efe2");
    assert.equal(tokens["--color-midground"],  "#3b2f1c");
  });

  test("card background blends bg toward midground", () => {
    const card = tokens["--color-card"];
    assert.ok(card.includes("color-mix"), `Expected color-mix, got: ${card}`);
    assert.ok(card.includes("oklch"), `Expected oklch, got: ${card}`);
    assert.ok(card.includes("#1a1208"), `Expected background, got: ${card}`);
    assert.ok(card.includes("#3b2f1c"), `Expected midground, got: ${card}`);
    // bg 85%, midground 15%
    assert.ok(card.includes("85%"), `Expected 85%, got: ${card}`);
  });

  test("card foreground equals palette foreground", () => {
    assert.equal(tokens["--color-card-foreground"], "#f5efe2");
  });

  test("primary blends midground toward foreground", () => {
    const primary = tokens["--color-primary"];
    assert.ok(primary.includes("color-mix"), `Expected color-mix in primary`);
    assert.ok(primary.includes("#3b2f1c"), `Expected midground in primary`);
    assert.ok(primary.includes("#f5efe2"), `Expected foreground in primary`);
  });

  test("primary-foreground is background (contrast pair)", () => {
    assert.equal(tokens["--color-primary-foreground"], "#1a1208");
  });

  test("destructive contains red (#ef4444) blended with midground", () => {
    const destr = tokens["--color-destructive"];
    assert.ok(destr.includes("#ef4444"), `Expected red in destructive`);
    assert.ok(destr.includes("#3b2f1c"), `Expected midground in destructive`);
  });

  test("destructive foreground is white", () => {
    assert.equal(tokens["--color-destructive-foreground"], "#ffffff");
  });

  test("muted blends bg 70% toward midground", () => {
    const muted = tokens["--color-muted"];
    assert.ok(muted.includes("70%"), `Expected 70%, got: ${muted}`);
    assert.ok(muted.includes("#1a1208"), `Expected bg, got: ${muted}`);
  });

  test("border blends midground 40% with background", () => {
    const border = tokens["--color-border"];
    assert.ok(border.includes("40%"), `Expected 40%, got: ${border}`);
    assert.ok(border.includes("#3b2f1c"), `Expected midground, got: ${border}`);
  });

  test("input matches border", () => {
    assert.equal(tokens["--color-input"], tokens["--color-border"]);
  });

  test("ring matches primary", () => {
    assert.equal(tokens["--color-ring"], tokens["--color-primary"]);
  });

  test("returns exactly 20 tokens", () => {
    assert.equal(Object.keys(tokens).length, 20);
  });

  test("all token keys start with --color-", () => {
    for (const key of Object.keys(tokens)) {
      assert.ok(key.startsWith("--color-"), `Unexpected key: ${key}`);
    }
  });
});

// ─── Golden tests — light/cozy palette ────────────────────────────────────────

describe("deriveTokens — light cozy palette", () => {
  const tokens = deriveTokens(LIGHT_PALETTE);

  test("verbatim inputs for light palette", () => {
    assert.equal(tokens["--color-background"], "#fef3c7");
    assert.equal(tokens["--color-foreground"], "#451a03");
    assert.equal(tokens["--color-midground"],  "#92400e");
  });

  test("accent-foreground is background (high contrast)", () => {
    assert.equal(tokens["--color-accent-foreground"], "#fef3c7");
  });

  test("popover blends bg 80% toward midground", () => {
    const popover = tokens["--color-popover"];
    assert.ok(popover.includes("80%"), `Expected 80%, got: ${popover}`);
  });

  test("secondary-foreground blends foreground 80% toward midground", () => {
    const sf = tokens["--color-secondary-foreground"];
    assert.ok(sf.includes("80%"), `Expected 80%, got: ${sf}`);
    assert.ok(sf.includes("#451a03"), `Expected foreground, got: ${sf}`);
  });
});
