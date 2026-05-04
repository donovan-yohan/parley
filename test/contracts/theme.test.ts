import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseParleyTheme, ParleyThemeSchema } from "../../src/contracts/theme.ts";

const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function readThemeYaml(worldId: string): unknown {
  const raw = readFileSync(
    path.join(repoRoot, "worlds", worldId, "theme.yaml"),
    "utf8"
  );
  return parseYaml(raw);
}

// ─── Accept shipped theme.yaml files ─────────────────────────────────────────

describe("parley-theme/v1 — acceptance", () => {
  test("last-lantern theme.yaml parses successfully", () => {
    const raw = readThemeYaml("last-lantern");
    const theme = parseParleyTheme(raw);
    assert.equal(theme.schema_version, "parley-theme/v1");
    assert.equal(theme.palette.background, "#1a1208");
    assert.equal(theme.palette.foreground, "#f5efe2");
    assert.equal(theme.layoutVariant, "noir");
    assert.equal(theme.layout?.density, "comfortable");
    assert.equal(theme.typography.fontDisplay, "Spectral");
    assert.ok(theme.componentStyles?.["dialogueFrame"]);
    assert.ok(theme.colorOverrides?.["primary"]);
  });

  test("neon-afterhours theme.yaml parses successfully", () => {
    const raw = readThemeYaml("neon-afterhours");
    const theme = parseParleyTheme(raw);
    assert.equal(theme.schema_version, "parley-theme/v1");
    assert.equal(theme.palette.background, "#020617");
    assert.equal(theme.palette.foreground, "#a5f3fc");
    assert.equal(theme.layoutVariant, "hud");
    assert.equal(theme.layout?.density, "compact");
    assert.ok(theme.componentStyles?.["card"]);
  });

  test("orchard-welcome theme.yaml parses successfully", () => {
    const raw = readThemeYaml("orchard-welcome");
    const theme = parseParleyTheme(raw);
    assert.equal(theme.schema_version, "parley-theme/v1");
    assert.equal(theme.palette.background, "#fef3c7");
    assert.equal(theme.layoutVariant, "cozy");
    assert.equal(theme.layout?.density, "spacious");
    assert.equal(theme.typography.fontDisplay, "Fraunces");
  });
});

// ─── Reject malformed inputs ──────────────────────────────────────────────────

describe("parley-theme/v1 — rejection", () => {
  const validBase = {
    schema_version: "parley-theme/v1",
    palette: {
      background: "#000000",
      midground: "#333333",
      foreground: "#ffffff",
    },
    typography: {
      fontSans: "Inter",
      fontMono: "JetBrains Mono",
      baseSize: 15,
    },
  } as const;

  test("rejects missing schema_version", () => {
    const { schema_version: _, ...without } = validBase;
    const result = ParleyThemeSchema.safeParse(without);
    assert.equal(result.success, false);
  });

  test("rejects wrong schema_version", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      schema_version: "parley-theme/v2",
    });
    assert.equal(result.success, false);
  });

  test("rejects missing palette.background", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      palette: { midground: "#333", foreground: "#fff" },
    });
    assert.equal(result.success, false);
  });

  test("rejects missing palette.midground", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      palette: { background: "#000", foreground: "#fff" },
    });
    assert.equal(result.success, false);
  });

  test("rejects missing palette.foreground", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      palette: { background: "#000", midground: "#333" },
    });
    assert.equal(result.success, false);
  });

  test("rejects unknown density value", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      layout: { density: "roomy" },
    });
    assert.equal(result.success, false);
  });

  test("rejects noiseOpacity > 1.2", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      palette: {
        ...validBase.palette,
        noiseOpacity: 1.5,
      },
    });
    assert.equal(result.success, false);
  });

  test("rejects noiseOpacity < 0", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      palette: {
        ...validBase.palette,
        noiseOpacity: -0.1,
      },
    });
    assert.equal(result.success, false);
  });

  test("rejects empty palette.background", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      palette: { background: "", midground: "#333", foreground: "#fff" },
    });
    assert.equal(result.success, false);
  });

  test("rejects malformed colorOverrides value (empty string)", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      colorOverrides: { primary: "" },
    });
    assert.equal(result.success, false);
  });

  test("rejects missing typography.fontSans", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      typography: { fontMono: "Mono", baseSize: 15 },
    });
    assert.equal(result.success, false);
  });

  test("rejects missing typography.baseSize", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      typography: { fontSans: "Inter", fontMono: "Mono" },
    });
    assert.equal(result.success, false);
  });

  test("rejects non-positive baseSize", () => {
    const result = ParleyThemeSchema.safeParse({
      ...validBase,
      typography: { ...validBase.typography, baseSize: 0 },
    });
    assert.equal(result.success, false);
  });
});

// ─── Optional field behavior ───────────────────────────────────────────────────

describe("parley-theme/v1 — optional fields", () => {
  const minimal = {
    schema_version: "parley-theme/v1",
    palette: {
      background: "#111",
      midground: "#444",
      foreground: "#eee",
    },
    typography: {
      fontSans: "Inter",
      fontMono: "Mono",
      baseSize: 16,
    },
  } as const;

  test("parses minimal theme with no optional fields", () => {
    const theme = parseParleyTheme(minimal);
    assert.equal(theme.schema_version, "parley-theme/v1");
    assert.equal(theme.layout, undefined);
    assert.equal(theme.layoutVariant, undefined);
    assert.equal(theme.componentStyles, undefined);
    assert.equal(theme.colorOverrides, undefined);
    assert.equal(theme.assets, undefined);
  });

  test("accepts all three density values", () => {
    for (const density of ["compact", "comfortable", "spacious"] as const) {
      const theme = parseParleyTheme({ ...minimal, layout: { density } });
      assert.equal(theme.layout?.density, density);
    }
  });

  test("accepts componentStyles with camelCase bucket and props", () => {
    const theme = parseParleyTheme({
      ...minimal,
      componentStyles: {
        dialogueFrame: {
          borderColor: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        },
      },
    });
    assert.equal(theme.componentStyles?.["dialogueFrame"]?.["borderColor"], "rgba(0,0,0,0.5)");
  });

  test("accepts assets with standard and custom keys", () => {
    const theme = parseParleyTheme({
      ...minimal,
      assets: {
        bg: "assets/bg.png",
        customLogo: "assets/logo.svg",
      },
    });
    assert.equal(theme.assets?.["bg"], "assets/bg.png");
    assert.equal(theme.assets?.["customLogo"], "assets/logo.svg");
  });
});
