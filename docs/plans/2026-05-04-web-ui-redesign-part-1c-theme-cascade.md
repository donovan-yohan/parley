# Web UI Redesign — Part 1c Implementation Plan (Theme Cascade + Slot Wiring + Zod Schemas)

> **For agentic workers:** Use superpowers:subagent-driven-development. 3 review checkpoints (Zod + theme YAMLs, theme cascade + slot consumers + worlds-loader, tests).

**Goal:** Land the theme cascade (palette → CSS vars via color-mix()), `componentStyles` bucket emission, `layoutVariant` data-attribute, slot consumers (`<SceneBackdrop>`, `<DialogueFrame>`), Zod schemas for `world.json` + `theme.yaml`, the worlds-loader manifest, and `theme.yaml` files for the existing three worlds. The shell still renders the old single-page UX (1d swaps in the new screens), but worlds visibly differ.

**Architecture:** Theme apply runs at world-load: parses `theme.yaml` → emits CSS custom properties on the shell root, sets `data-layout-variant`, attaches asset URLs as `--world-asset-*` vars. Slot consumers read named slots from the registry; default fallbacks render when no world component is registered. Build-time discovery script writes `dist/world-manifest.json` for the lazy worlds-loader.

**Tech Stack:** New dep: `yaml` (small, well-maintained). Reuses existing Zod scaffolding from `src/contracts/`.

**Source spec:** `docs/specs/2026-05-04-web-ui-redesign-design.md` — sections "Theme Model — Lifted from Hermes", "Worlds-loader runtime contract", "Manifest & theme validation" (per Q-3 review fix).

---

## File Structure

**New:**
- `src/contracts/world.ts` — Zod schema for `parley-world/v1` + minimal manifest fields.
- `src/contracts/theme.ts` — Zod schema for `parley-theme/v1` + nested palette/typography/layout/componentStyles/colorOverrides.
- `src/contracts/worldManifest.ts` — Zod schema for `parley-world-manifest/v1` (worlds-loader manifest).
- `src/shell/theme/apply.ts` — `applyTheme(theme: ParleyTheme, worldId: string)` — emits CSS custom properties on `:root[data-world-id=<worldId>]`.
- `src/shell/theme/tokens.ts` — `deriveTokens(palette: Palette): Record<string, string>` — produces all shadcn-style tokens via `color-mix()` literals.
- `src/shell/theme/loadWorldTheme.ts` — fetches `theme.yaml`, validates, applies. Returns the parsed theme.
- `src/shell/components/SceneBackdrop.tsx` — slot consumer, default = `<Backdrop src=var(--world-asset-bg)>`.
- `src/shell/components/DialogueFrame.tsx` — slot consumer, default = semi-translucent panel reading componentStyles.
- `src/worlds-loader/index.ts` — `loadWorldManifest()`, `loadWorldBundle(worldId, manifest)` — fetches the manifest at boot, lazy-loads world bundles on demand. Falls back to default shell + dev banner on bundle load failure.
- `scripts/discover-worlds.ts` — build-time script scanning `worlds/*/world.json` for `shell: "custom"` entries; emits `dist/world-manifest.json` post-build.
- `worlds/last-lantern/theme.yaml` — palette + typography + componentStyles inspired by current `art-style.md` (warm parchment + lantern glow).
- `worlds/neon-afterhours/theme.yaml` — neon cyberpunk palette.
- `worlds/orchard-welcome/theme.yaml` — pastel cozy palette.
- `test/contracts/world.test.ts` — Zod parse + reject for `world.json`.
- `test/contracts/theme.test.ts` — Zod parse + reject for `theme.yaml`.
- `test/theme-cascade.test.js` — golden test: known palette → exact CSS vars emitted.
- `test/theme-componentStyles.test.js` — golden test: bucket camelCase → `--component-<bucket>-<kebab>` emission.
- `test/worlds-loader.test.js` — manifest fetch + lazy load + integrity verification + 404 fallback.

**Modified:**
- `package.json` — add `yaml` dep.
- `vite.config.ts` — post-build hook running `scripts/discover-worlds.ts` to emit `world-manifest.json`.
- `src/sdk/components/index.ts` — export SceneBackdrop and DialogueFrame.
- `src/shell/main.tsx` — call `loadWorldManifest()` at boot before rendering anything that depends on a world being selected.
- `src/shell/SinglePageApp.tsx` — when scenario picker selection changes, call `loadWorldTheme(worldId)` so the user sees the theme apply visually (still the old UX shape, but now skinned).

**Untouched (1c only):**
- L1/L2/L3 page components (1d).
- `src/client/` and old endpoints (1d).
- `_PARLEY_PLUGINS_.register` for full `shell: "custom"` worlds — the loader is wired but no world ships a custom shell yet (Part 2 brings the first one).

---

## Group A — Setup + theme YAMLs (PARALLEL)

### Task A1: Add `yaml` dep + worlds-loader scaffolding
- `npm install yaml@^2.6.0`.
- Stub `src/worlds-loader/index.ts` with empty exports + a TODO. Real implementation lands in Group B.

### Task A2: Author `worlds/last-lantern/theme.yaml`
Palette derived from `worlds/last-lantern/art-style.md`. Typography: serif body (Spectral) + sans display (Inter). `layoutVariant: noir`. `componentStyles.dialogueFrame` adds warm-glow accent.

### Task A3: Author `worlds/neon-afterhours/theme.yaml`
Cyberpunk palette (deep blue-violet bg, neon cyan accent). Mono fonts (JetBrains Mono / Share Tech Mono). `layoutVariant: hud`. `componentStyles.card` adds notched corners via `clip-path`.

### Task A4: Author `worlds/orchard-welcome/theme.yaml`
Pastel cozy (sage / cream / blush). Rounded display font. `layoutVariant: cozy`. `componentStyles.dialogueFrame` adds chunky border-radius.

**Checkpoint 1:** All three theme.yaml files validate-parse via the new Zod schema (Group B will add the schema; in this Checkpoint just verify by-hand that YAML is well-formed via `node -e "console.log(require('yaml').parse(require('fs').readFileSync('worlds/.../theme.yaml','utf8')))"`).

Commit: `feat(1c): add theme.yaml for the three existing worlds`

---

## Group B — Cascade + Slot Consumers + Worlds-Loader (one subagent, sequential within)

### B1: Zod schemas
- `src/contracts/world.ts` — `parley-world/v1`. Required: schema_version, id, name, premise, tone, scenarios. Optional: cover, shell ("default" | "custom"), layoutVariant, theme, stylesheet.
- `src/contracts/theme.ts` — `parley-theme/v1`. Required: schema_version, palette (background/midground/foreground), typography (fontSans, fontMono, baseSize). Optional: warmGlow, noiseOpacity, fontDisplay, fontUrl, layout (radius/density), layoutVariant, assets, componentStyles (record of buckets), colorOverrides.
- `src/contracts/worldManifest.ts` — `parley-world-manifest/v1`. Required: schema_version, worlds (record of worldId → entry).

### B2: Theme cascade
- `src/shell/theme/tokens.ts` — `deriveTokens(palette)` returns ~20 shadcn-style tokens (`--color-card`, `--color-border`, `--color-primary`, etc.) computed via `color-mix()` literals. Foreground/midground/background as inputs.
- `src/shell/theme/apply.ts` — `applyTheme(theme, worldId)` emits a `<style data-world-id="<id>">` block on the document with all derived tokens, componentStyles vars, and asset vars; sets `<html data-world-id="<id>" data-layout-variant="<v>">`.
- `src/shell/theme/loadWorldTheme.ts` — fetches `/world-assets/theme.yaml?scenario=<id>` (already-existing static-asset endpoint covers this), parses with yaml lib, validates via Zod, applies. Returns parsed theme.

### B3: Slot consumers
- `src/shell/components/SceneBackdrop.tsx` — `<Backdrop>` wrapped to read `var(--world-asset-bg)` if set; otherwise flat `var(--color-background)`. Used by L3 (1d).
- `src/shell/components/DialogueFrame.tsx` — semi-translucent panel reading `var(--component-dialogue-frame-*)` vars. Default styles match the spec's L3 design.
- Both export from `src/sdk/components/index.ts` so worlds can reference them.

### B4: Worlds-loader
- `src/worlds-loader/index.ts`:
  - `loadWorldManifest(): Promise<WorldManifest>` — fetches `/world-manifest.json`, parses, validates.
  - `loadWorldBundle(worldId, manifest): Promise<{ shell: "default" | "custom" }>` — for `shell: "default"` with `entryUrl: null`, no-op success. For `shell: "default"` with an entryUrl, dynamic-import the bundle (slot registrations happen as side-effects on import). For `shell: "custom"`, dynamic-import the bundle (it owns root render). Subresource-integrity verification when integrity hash present.
  - On failure: log + throw a `WorldLoadError` with a `cause` field. Caller (shell) decides UX.

### B5: Build pipeline wiring
- `scripts/discover-worlds.ts` — scans `worlds/*/world.json` (using existing Zod schema), emits `dist/world-manifest.json` matching `parley-world-manifest/v1`. For now no worlds have `shell: "custom"`, so all `entryUrl: null`.
- `vite.config.ts` — add a `closeBundle` rollup hook calling `discover-worlds.ts`.

### B6: Wire into shell main
- `src/shell/main.tsx` — at boot, call `loadWorldManifest()` and stash the result on `window.__PARLEY_WORLD_MANIFEST__` for downstream consumers.
- `src/shell/SinglePageApp.tsx` — on scenario change, call `loadWorldTheme(worldId)` so the user sees the theme apply (visible diff between worlds).

**Checkpoint 2:** Build emits `dist/world-manifest.json`. Loading the dev server and switching scenarios swaps theme visibly. Old smoke scripts still pass. typecheck clean.

Commit: `feat(1c): theme cascade, slot consumers, Zod schemas, worlds-loader`

---

## Group C — Tests (PARALLEL)

### C1: Zod schema tests
- `test/contracts/world.test.ts` — accepts each shipped `world.json`; rejects malformed cases (missing fields, bad enum, bad regex).
- `test/contracts/theme.test.ts` — accepts each shipped `theme.yaml`; rejects malformed cases.

### C2: Theme cascade golden tests
- `test/theme-cascade.test.js` — given a fixture palette, assert exact CSS vars emitted (golden string match).
- `test/theme-componentStyles.test.js` — fixture YAML with `dialogueFrame.borderColor` → assert `--component-dialogue-frame-border-color` emitted with correct value. Cover camelCase → kebab transformation edge cases.

### C3: Worlds-loader tests
- `test/worlds-loader.test.js` — fetch manifest happy path, lazy-load bundle (mocked), 404 → fallback, integrity mismatch → fallback, eval error → fallback.

### C4: Slot consumer tests (smoke only)
- `test/sdk-slot-consumers.test.js` — SceneBackdrop renders flat color when no asset; DialogueFrame renders default styles when no override registered. Use module-level introspection rather than full Preact mount.

**Checkpoint 3:** All new tests pass. Total ~200 tests. typecheck clean. Build succeeds + emits manifest.

Commit (per file or batched): `test(1c): theme + Zod + worlds-loader coverage`

---

## Out of scope for 1c (deferred to 1d / Part 2)

- L1/L2/L3 screens (1d).
- Removal of `src/client/`, scenario dropdown, truth panel UI (1d).
- World bundle that actually populates a slot (Part 2 — first flagship world).
- `shell: "custom"` end-to-end test (Part 2).
