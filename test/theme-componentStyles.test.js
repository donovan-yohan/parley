import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCSSText, toKebab } from "../src/shell/theme/apply.ts";

// ─── toKebab transformation ────────────────────────────────────────────────────

describe("toKebab — camelCase → kebab-case", () => {
  test("single word unchanged", () => {
    assert.equal(toKebab("background"), "background");
  });

  test("borderColor → border-color", () => {
    assert.equal(toKebab("borderColor"), "border-color");
  });

  test("backdropFilter → backdrop-filter", () => {
    assert.equal(toKebab("backdropFilter"), "backdrop-filter");
  });

  test("backgroundColor → background-color", () => {
    assert.equal(toKebab("backgroundColor"), "background-color");
  });

  test("dialogueFrame → dialogue-frame", () => {
    assert.equal(toKebab("dialogueFrame"), "dialogue-frame");
  });

  test("clipPath → clip-path", () => {
    assert.equal(toKebab("clipPath"), "clip-path");
  });

  test("borderRadius → border-radius", () => {
    assert.equal(toKebab("borderRadius"), "border-radius");
  });

  test("already-kebab string unchanged", () => {
    assert.equal(toKebab("border-color"), "border-color");
  });
});

// ─── buildCSSText — componentStyles emission ──────────────────────────────────

const FIXTURE_THEME = {
  schema_version: "parley-theme/v1",
  palette: {
    background: "#1a1208",
    midground:  "#3b2f1c",
    foreground: "#f5efe2",
  },
  typography: {
    fontSans:  "Inter",
    fontMono:  "JetBrains Mono",
    baseSize:  15,
  },
  componentStyles: {
    dialogueFrame: {
      background:     "rgba(0,0,0,0.55)",
      borderColor:    "rgba(201,163,92,0.25)",
      backdropFilter: "blur(2px)",
    },
    card: {
      border:        "1px solid rgba(201,163,92,0.18)",
      backdropFilter: "blur(2px)",
    },
  },
};

describe("buildCSSText — componentStyles → CSS vars", () => {
  const worldId = "last-lantern";
  const css = buildCSSText(FIXTURE_THEME, worldId);

  test("output contains correct scoped selector", () => {
    assert.ok(
      css.includes(`:root[data-world-id="${worldId}"]`),
      `Expected scoped selector, got: ${css.slice(0, 100)}`
    );
  });

  test("dialogueFrame.background → --component-dialogue-frame-background", () => {
    assert.ok(
      css.includes("--component-dialogue-frame-background: rgba(0,0,0,0.55);"),
      `Missing dialogue-frame background var in:\n${css}`
    );
  });

  test("dialogueFrame.borderColor → --component-dialogue-frame-border-color", () => {
    assert.ok(
      css.includes("--component-dialogue-frame-border-color: rgba(201,163,92,0.25);"),
      `Missing dialogue-frame border-color var in:\n${css}`
    );
  });

  test("dialogueFrame.backdropFilter → --component-dialogue-frame-backdrop-filter", () => {
    assert.ok(
      css.includes("--component-dialogue-frame-backdrop-filter: blur(2px);"),
      `Missing dialogue-frame backdrop-filter var in:\n${css}`
    );
  });

  test("card.border → --component-card-border", () => {
    assert.ok(
      css.includes("--component-card-border: 1px solid rgba(201,163,92,0.18);"),
      `Missing card-border var in:\n${css}`
    );
  });

  test("card.backdropFilter → --component-card-backdrop-filter", () => {
    assert.ok(
      css.includes("--component-card-backdrop-filter: blur(2px);"),
      `Missing card-backdrop-filter var in:\n${css}`
    );
  });
});

// ─── buildCSSText — palette tokens ────────────────────────────────────────────

describe("buildCSSText — derived palette tokens emitted", () => {
  const css = buildCSSText(FIXTURE_THEME, "test-world");

  test("--color-background emitted", () => {
    assert.ok(css.includes("--color-background: #1a1208;"), `Not found in:\n${css}`);
  });

  test("--color-foreground emitted", () => {
    assert.ok(css.includes("--color-foreground: #f5efe2;"), `Not found in:\n${css}`);
  });

  test("--color-card uses color-mix", () => {
    assert.ok(css.includes("--color-card: color-mix("), `Not found in:\n${css}`);
  });
});

// ─── buildCSSText — typography vars ───────────────────────────────────────────

describe("buildCSSText — typography vars", () => {
  const css = buildCSSText(FIXTURE_THEME, "test-world");

  test("--font-sans emitted (unquoted, supports stacks)", () => {
    assert.ok(css.includes("--font-sans: Inter;"), `Not found in:\n${css}`);
  });

  test("--font-mono emitted", () => {
    assert.ok(css.includes("--font-mono: JetBrains Mono;"), `Not found in:\n${css}`);
  });

  test("comma-separated font stack passes through unquoted", () => {
    const stackTheme = {
      ...FIXTURE_THEME,
      typography: { ...FIXTURE_THEME.typography, fontSans: "Inter, sans-serif" },
    };
    const stackCss = buildCSSText(stackTheme, "test");
    assert.ok(
      stackCss.includes("--font-sans: Inter, sans-serif;"),
      `Expected unquoted comma stack, got:\n${stackCss}`
    );
  });

  test("--font-base-size emitted", () => {
    assert.ok(css.includes("--font-base-size: 15px;"), `Not found in:\n${css}`);
  });
});

// ─── buildCSSText — asset vars ────────────────────────────────────────────────

describe("buildCSSText — asset vars", () => {
  const themeWithAssets = {
    ...FIXTURE_THEME,
    assets: {
      bg:   "assets/backgrounds/tavern.png",
      hero: "assets/hero.png",
    },
  };
  const css = buildCSSText(themeWithAssets, "test-world");

  test("--world-asset-bg emitted for bg (resolved /world-assets/ URL, no url() wrapper)", () => {
    assert.ok(
      css.includes("--world-asset-bg: /world-assets/assets/backgrounds/tavern.png?scenario=test-world;"),
      `Not found in:\n${css}`
    );
  });

  test("--world-asset-hero emitted for hero", () => {
    assert.ok(
      css.includes("--world-asset-hero: /world-assets/assets/hero.png?scenario=test-world;"),
      `Not found in:\n${css}`
    );
  });

  test("absolute URLs (data:, http:, /) pass through unchanged", () => {
    const absTheme = {
      ...FIXTURE_THEME,
      assets: {
        bg:   "data:image/png;base64,abc",
        hero: "https://cdn.example/hero.png",
        crest: "/static/crest.png",
      },
    };
    const absCss = buildCSSText(absTheme, "test-world");
    assert.ok(absCss.includes("--world-asset-bg: data:image/png;base64,abc;"), absCss);
    assert.ok(absCss.includes("--world-asset-hero: https://cdn.example/hero.png;"), absCss);
    assert.ok(absCss.includes("--world-asset-crest: /static/crest.png;"), absCss);
  });
});

// ─── buildCSSText — colorOverrides ────────────────────────────────────────────

describe("buildCSSText — colorOverrides", () => {
  const themeWithOverrides = {
    ...FIXTURE_THEME,
    colorOverrides: {
      primary: "#c9a35c",
      ring:    "rgba(201,163,92,0.5)",
    },
  };
  const css = buildCSSText(themeWithOverrides, "test-world");

  test("colorOverrides.primary pins --color-primary", () => {
    assert.ok(
      css.includes("--color-primary: #c9a35c;"),
      `Not found in:\n${css}`
    );
  });

  test("colorOverrides.ring pins --color-ring", () => {
    assert.ok(
      css.includes("--color-ring: rgba(201,163,92,0.5);"),
      `Not found in:\n${css}`
    );
  });
});

// ─── buildCSSText — density / layout ──────────────────────────────────────────

describe("buildCSSText — layout vars", () => {
  test("compact density → --spacing-mul: 0.85", () => {
    const theme = { ...FIXTURE_THEME, layout: { density: "compact" } };
    const css = buildCSSText(theme, "test");
    assert.ok(css.includes("--spacing-mul: 0.85;"), `Not found in:\n${css}`);
  });

  test("spacious density → --spacing-mul: 1.2", () => {
    const theme = { ...FIXTURE_THEME, layout: { density: "spacious" } };
    const css = buildCSSText(theme, "test");
    assert.ok(css.includes("--spacing-mul: 1.2;"), `Not found in:\n${css}`);
  });

  test("comfortable density → --spacing-mul: 1", () => {
    const theme = { ...FIXTURE_THEME, layout: { density: "comfortable" } };
    const css = buildCSSText(theme, "test");
    assert.ok(css.includes("--spacing-mul: 1;"), `Not found in:\n${css}`);
  });

  test("no layout → --spacing-mul: 1 (default)", () => {
    const css = buildCSSText(FIXTURE_THEME, "test");
    assert.ok(css.includes("--spacing-mul: 1;"), `Not found in:\n${css}`);
  });

  test("radius from layout.radius", () => {
    const theme = { ...FIXTURE_THEME, layout: { radius: "0.25rem" } };
    const css = buildCSSText(theme, "test");
    assert.ok(css.includes("--radius: 0.25rem;"), `Not found in:\n${css}`);
  });
});
