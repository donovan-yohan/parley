# Web UI Redesign — Design Spec

**Date:** 2026-05-04
**Branch:** `feat/web-ui-redesign`
**Status:** Design accepted; ready for implementation plan
**Related:**
- `docs/plans/2026-05-03-instance-wiki-authoring.md` — template/instance materialization
- `docs/plans/2026-05-04-belayer-profile-coupling.md` — per-NPC Hermes profile substrate
- `docs/plans/2026-05-02-visual-asset-pipeline.md` — world art assets
- `docs/research/2026-05-02-text-rpg-ui-patterns.md` — UX prior art

## Problem

The current Parley web UI (`src/server.js` + `src/client/`) is a single-page demo shell with a scenario dropdown. It cannot express the finished product's mental model, in which:
- A user has multiple installed worlds (templates), each with multiple personal playthroughs (instances).
- Each playthrough hosts multiple stories (template + instance).
- Each world should look and feel visibly different — different worlds should not feel like color skins of the same app, but like genuinely different products.

We need a UI that supports this hierarchy and gives each world genuine creative latitude over its presentation, without losing one consistent landing experience.

## Goals

1. Express the four-layer data model (world template → world instance → story template → story instance) in a navigable UI.
2. Give worlds dramatic per-world visual identity, comparable to the Strike Freedom Cockpit ceiling on Hermes Agent's dashboard.
3. Keep one neutral, consistent landing page so users can always find their saves.
4. Preserve a single React-app build (no per-world build pipelines), with one shared component instance.
5. Lift design principles from the Hermes Agent dashboard — not interop, just patterns.

## Non-Goals

- Multi-user accounts, auth, sync.
- World template authoring UI (creating a new world from scratch). Worlds remain filesystem drop-ins for the MVP.
- Marketplace / registry of installable worlds. (Future work — corresponds to "C later" in scope; see Future Work.)
- Multiplayer / shared sessions.

This spec **does** treat the play screen as a real-agent UI from day one. The deterministic-fixture turn author (`createScenarioFixtureAuthor` in `src/runtime/turnAuthor.js`) becomes a test-only fallback; the production UI is built against the agent-driven turn author seam from `belayer-profile-coupling`. See "Demo Cleanup" below for what we are removing.

## Information Architecture

Three navigation levels over four data layers.

### Data layers

| Layer | Path | Mutability |
|---|---|---|
| World template | `worlds/<world-id>/` | Read-only at runtime |
| World instance | `instances/<world-id>/<instance-id>/` | Mutable; cross-story memory lives here |
| Story template | `worlds/<world-id>/scenarios/<story-id>/` | Read-only at runtime |
| Story instance | `instances/<world-id>/<instance-id>/stories/<story-id>/` | Mutable; transcript + per-story canon |

The `instances/` root is introduced by this spec and aligns with the `instance-wiki-authoring` plan. The current `worlds/<id>/state/` directory is migrated to `instances/<id>/default/` during the cutover (see Migration).

### Navigation

```
L1  Landing                       [Parley neutral chrome]
    Tile grid: world templates, with cover art
    Recency rail: recent story instances across all worlds

    ↓ click world tile     → L2 with most recent (or freshly created) instance
    ↓ click recency item   → L3 directly

L2  World instance homebase       [WORLD SKIN takes over]
    Story list: story templates + your story instances per template
    Instance switcher (if multiple instances of this world exist)
    "+ new story" CTA per template

    ↓ click story instance → L3 (resume)
    ↓ click story template → L3 (new story instance, auto-created)

L3  Story instance / play         [WORLD SKIN]
    Scene backdrop, transcript, input, suggested intents
    Cast/canon accessible via slide-out drawer
```

### Navigation rules

- L1 is the only neutral surface. L2 and L3 are fully world-skinned.
- L2 and L3 carry a small `‹ Parley` exit affordance in the shell header that returns to L1.
- World instance creation is implicit: clicking a world tile with no existing instance creates `instances/<world-id>/playthrough-1/` and lands the user in L2. Renameable from the L2 header.
- Story instance creation is implicit: clicking a story template with no existing instance creates a fresh story instance and lands the user in L3.
- The recency rail on L1 is a quick-resume affordance only; it does not duplicate L2 functionality.

## Tech Stack

**Frontend:** Preact + Vite + TypeScript.

**Why Preact:** API-compatible with React (so we can study and port Hermes plugin code), but with a ~10× smaller bundle. Worlds with `shell: "custom"` are bundled per-world with Vite, so a small runtime matters.

**Why not React:** Bundle weight is real once worlds ship their own component code. The user has explicitly stated we are lifting design principles, not literal Hermes plugin bundles, so React API parity is not required.

**Why not vanilla / web components:** The slot pattern (named extension points populated by world bundles) is materially harder without a component framework. We accept the build step.

**Backend:** Existing `src/server.js` Node http server stays. New API endpoints added for the world instance / story instance lifecycle. No framework migration on the server.

**Build:** A single `vite.config.ts` at the repo root. The shell builds to `dist/`. Each world that opts into `shell: "custom"` builds to `dist/worlds/<world-id>/`.

## Repository Layout

```
parley/
├── src/
│   ├── server.js                 # existing http server (extended)
│   ├── runtime/                  # existing turn/scenario/truth modules
│   ├── shell/                    # NEW: Parley shell app (Preact)
│   │   ├── index.html
│   │   ├── main.tsx              # mounts shell, exposes __PARLEY_SDK__
│   │   ├── sdk.ts                # SDK surface (h, hooks, components, fetchJSON, ...)
│   │   ├── components/           # Card, Button, Tabs, PluginSlot, ...
│   │   ├── pages/
│   │   │   ├── Landing.tsx       # L1
│   │   │   ├── WorldHome.tsx     # L2
│   │   │   └── StoryPlay.tsx     # L3
│   │   ├── theme/
│   │   │   ├── tokens.ts         # color-mix() cascade entry points
│   │   │   ├── apply.ts          # theme YAML → CSS vars on document
│   │   │   └── default.css       # base shadcn-style token set
│   │   └── slots.ts              # registerSlot, useSlot, named slot constants
│   └── worlds-loader/            # NEW: discovers + loads world bundles
├── worlds/<world-id>/
│   ├── world.json                # NEW: world manifest (replaces ad-hoc fields)
│   ├── theme.yaml                # NEW: Hermes-style theme spec
│   ├── shell/                    # OPTIONAL: world's custom Preact bundle (if shell:custom)
│   │   ├── entry.tsx
│   │   └── slots.tsx
│   ├── stylesheet.css            # OPTIONAL: world CSS file (no 32KiB cap)
│   ├── assets/                   # existing — backgrounds, portraits, manifest.json
│   ├── characters/               # existing
│   ├── lore/                     # existing
│   ├── scenes/                   # existing
│   └── scenarios/                # NEW (moved from top-level scenarios/<id>/)
│       └── <story-id>/scenario.json
└── instances/                    # NEW: mutable run state
    └── <world-id>/<instance-id>/
        ├── instance.json         # display name, created_at, last_played_at
        ├── canon/                # cross-story canon facts
        ├── characters/           # NPCs met (cross-story memory substrate)
        └── stories/<story-id>/
            ├── story.json
            ├── turns.jsonl
            └── verdicts.jsonl
```

The current top-level `scenarios/` directory is moved under each world it belongs to. Today's three scenarios all have a 1:1 mapping to their world id, so the move is mechanical.

## World Plugin Model — `__PARLEY_SDK__`

The shell exposes a single global, `window.__PARLEY_SDK__`, which world bundles read from instead of importing their own copy of Preact. This enforces a single Preact instance, prevents duplicate hook registries, and keeps world bundles small.

```ts
// src/shell/sdk.ts
declare global {
  interface Window {
    __PARLEY_SDK__: {
      h: typeof import('preact').h;
      Fragment: typeof import('preact').Fragment;
      hooks: typeof import('preact/hooks');
      components: {
        Card, Button, Tabs, PluginSlot, Drawer, Backdrop, ChoiceList, ...
      };
      api: {
        getWorlds(), getInstance(worldId, instanceId), getStory(...), runTurn(...)
      };
      utils: { fetchJSON, cn, timeAgo, useI18n };
    };
    __PARLEY_PLUGINS__: {
      register(worldId: string, component: Component): void;
      registerSlot(worldId: string, slot: SlotName, component: Component): void;
    };
  }
}
```

**Slot names** (initial set):

```
header-crest      — small icon/logo in shell header
header-tagline    — text right of header crest
sidebar-rail      — vertical rail, optional, present in some layoutVariants
scene-backdrop    — full-bleed background behind L3 (defaults to assets/backgrounds/<scene>.png)
dialogue-frame    — wrapper around input + choice list
inventory-rail    — optional accessory rail
footer-tagline    — small footer text
```

Worlds may register components into any subset. Unregistered slots fall back to shell defaults.

**Manifest — `world.json`:**

```json
{
  "schema_version": "parley-world/v1",
  "id": "last-lantern",
  "name": "Last Lantern",
  "premise": "A rain-soaked crossroads tavern...",
  "tone": "grounded fantasy mystery",
  "cover": "assets/cover.png",
  "shell": "default",
  "layoutVariant": "noir",
  "theme": "theme.yaml",
  "stylesheet": "stylesheet.css",
  "scenarios": ["rain-at-the-crossroads", "smoke-and-oil"]
}
```

When `shell` is `"custom"`, the loader fetches `dist/worlds/<id>/entry.js` and lets the world own the L2/L3 root render. When `shell` is `"default"` (most worlds), the loader applies `theme.yaml` + optional `stylesheet.css` and registers any slot components from `shell/slots.tsx` if present.

## Theme Model — Lifted from Hermes

`theme.yaml` per world:

```yaml
schema_version: parley-theme/v1
palette:
  background: "#1a1208"
  midground:  "#3b2f1c"
  foreground: "#f5efe2"
  warmGlow:   "rgba(201, 163, 92, 0.18)"
  noiseOpacity: 0.06
typography:
  fontSans: "Inter"
  fontMono: "JetBrains Mono"
  fontDisplay: "Spectral"
  fontUrl: "https://fonts.googleapis.com/css2?family=Spectral..."
  baseSize: 15
  lineHeight: 1.65
  letterSpacing: "0"
layout:
  radius: 0.25rem
  density: comfortable        # compact | comfortable | spacious
layoutVariant: noir           # cozy | noir | hud | (custom)
assets:
  bg: "assets/backgrounds/lantern-night.png"
  hero: "assets/backgrounds/lantern-night.png"
  crest: "assets/cover.png"
componentStyles:
  card:
    border: "1px solid var(--color-border)"
    backdropFilter: "blur(2px)"
  dialogueFrame:
    background: "rgba(0,0,0,0.55)"
    borderColor: "rgba(201,163,92,0.25)"
colorOverrides:
  primary: "#c9a35c"
  ring:    "rgba(201,163,92,0.5)"
```

**Token cascade.** All shadcn-style tokens (`--color-card`, `--color-border`, `--color-primary`, `--color-foreground`, ...) derive from the three-color `palette` via `color-mix()`, with `colorOverrides` pinning specific tokens when derivation is not enough. This is the Hermes "3-color → ~20 tokens" pattern.

**Component style buckets.** Each bucket (`card`, `dialogueFrame`, `header`, `sidebar`, `backdrop`, ...) accepts arbitrary camelCase CSS props that the loader emits as `--component-<bucket>-<kebab-prop>` variables. Shell components consume these vars. World authors never write selectors.

**Stylesheet escape hatch.** A world may ship `stylesheet.css` at the world root. **No size cap.** Hermes's 32 KiB `customCSS` cap is the most-cited friction in their community ([issue #18289](https://github.com/NousResearch/hermes-agent/issues/18289)); we skip it.

**`layoutVariant`.** Surfaced as `data-layout-variant="..."` on the shell root. Slot components and CSS may key off this attribute. Defaults: `cozy`, `noir`, `hud`. Worlds may declare a custom variant (e.g. `noir-rain`); shell components only react to the three defaults, but world-supplied slot components can react to any variant.

## Screen Designs

### L1 — Landing (neutral chrome)

Tile grid + recent activity rail. Three-column world cover grid (3:4 aspect tiles); below that, a "Continue playing" linear list of the most recent 5–10 story instances across all worlds, sorted by `last_played_at`.

Empty-state world tile: shows cover + "no saves yet" + tap-to-start.

### L2 — World instance homebase (world-skinned)

Story list. Each row = a story template with its associated instances inline (similar pattern to L1, recursed one level). World skin renders this with whatever component overrides it has registered.

Instance switcher in the L2 header when more than one instance of this world exists; otherwise hidden.

### L3 — Story instance / play (world-skinned)

Default shell: classic interactive-fiction layout with a full-bleed `scene-backdrop` slot, narration paragraphs, inline avatar+nameplate when an NPC speaks, input box, suggested-intent buttons, slide-out drawer for cast/canon.

**Inline portrait pattern (default):** A round 42px portrait sits left of the speaker's dialogue paragraph. Speaker name renders as a small uppercase label above the speech. Narration paragraphs (no speaker) render full-width with no portrait. Vignette + bottom-fade scrim ensure legibility over the backdrop.

**Truth verdict:** Hidden by default. Surfaces inline as a small pill ("Mara wouldn't say that — try again") only when a turn is rejected. A debug toggle in the L3 settings menu shows the full verdict panel.

**Backdrop:** Full-bleed render of `worlds/<id>/assets/backgrounds/<scene-id>.png` with a configurable vignette + scrim controlled by `componentStyles.backdrop`. Per-scene swap when the active scene changes; per-turn swap is future work (see Future Work).

## Migration

Tracked migrations from current state:

1. **Move `scenarios/<id>/scenario.json` → `worlds/<world-id>/scenarios/<id>/scenario.json`.** Each scenario today has a 1:1 mapping to its world id. Mechanical move + path updates in `src/runtime/scenarioPacks.js`.
2. **Move `worlds/<id>/state/` → `instances/<id>/default/`.** A "default" instance is created for each world that has existing state. The instance materialization rules from `instance-wiki-authoring` apply; this spec only requires the directory move.
3. **Add `world.json` and `theme.yaml`** to each existing world. Initial `theme.yaml` reflects each world's existing `art-style.md` palette.
4. **Replace `src/client/`** with `src/shell/` (Preact + Vite). Old client is removed in the same change set, not left as a fallback.
5. **Add API endpoints:** `GET /api/worlds`, `GET /api/instances?world=<id>`, `POST /api/instances` (create), `GET /api/stories?world=<id>&instance=<id>`, `POST /api/stories` (create story instance), `GET /api/story?world=<id>&instance=<id>&story=<id>`, `POST /api/turn` (extended with instance + story ids). Existing `POST /api/turn` is replaced; old `?scenario=` query param is removed.

## Implementation Phases

**Part 1 — Infrastructure.** Build the shell, SDK, theme cascade, slot system, manifest loader, repo migration (instance/template split, scenarios under worlds), API endpoints, and a single bare-bones default theme that proves the cascade works end-to-end. No flagship demo worlds yet. Acceptance for Part 1 is below.

**Part 2 — Three flagship demo worlds.** Build three themed worlds whose sole purpose is to demonstrate the depth of the override system. Each ships its own `theme.yaml`, `stylesheet.css`, slot components, and `layoutVariant`. At least one of the three uses `shell: "custom"` to demonstrate the rung-6 ceiling.

| Codename | Inspiration | Theme angle | layoutVariant | shell |
|---|---|---|---|---|
| `verdant-aria` | Final Fantasy (early SNES era; ATB / world-map vibe) | Ornate serif typography, jewel palette, gold filigree borders, scrolling banner-style choices | `noir` (overridden — rich color, ornate chrome) | `default` + heavy `componentStyles` |
| `night-city-after-curfew` | Cyberpunk 2077 | Glitched neon, magenta + cyan, holographic UI elements, scanline overlay, monospace + Orbitron display, HUD-style stat bars | `hud` | `custom` — flagship reference for shell takeover |
| `gentle-shore` | Animal Crossing | Pastel sky gradients, rounded chunky shapes, hand-letter display font, paper-card dialogue with bobbing portraits, sound-cue placeholder hooks | `cozy` | `default` + slot overrides for `dialogue-frame` and `scene-backdrop` |

These three are not licensed properties — they are *theme inspirations* with our own copy and assets. They exist to stress-test the override system and be visibly distinct in side-by-side screenshots.

The current three worlds (Last Lantern, Neon Afterhours, Mossgrove) become reference content: they remain installed and playable, get default-theme refreshes during Part 1, but receive no flagship-level treatment until later.

## Demo Cleanup

The current codebase carries demo-era artifacts that the new UI does not inherit. Part 1 removes:

- **Scenario dropdown** (`src/client/app.js` `#theme-select`). The new UI navigates worlds and stories via the L1/L2 flow; there is no global scenario picker.
- **Visible truth-verdict panel** in the play screen. Verdicts surface only as inline rejection pills (see L3 design); the full panel is debug-only.
- **`/api/scenarios` endpoint** in its current form. Replaced by `GET /api/worlds` + `GET /api/stories?world=<id>&instance=<id>`.
- **`scenarios/` top-level directory**. Migrated under `worlds/<id>/scenarios/`.
- **`worlds/<id>/state/` directory**. Migrated to `instances/<world-id>/<instance-id>/`.
- **Smoke scripts that target the dropdown UI** (`scripts/smoke-parley-scenarios.mjs` if it exercises the demo dropdown). Replaced by smokes against the new endpoints.

The deterministic-fixture turn author (`createScenarioFixtureAuthor`) is **not** removed — it stays as the test-only author for unit tests. The shell, however, talks to the production agent author seam from `belayer-profile-coupling` and never instantiates the fixture itself.

## Acceptance Criteria — Part 1

1. Running `npm start` opens the new L1 landing on `http://localhost:4173`.
2. The three existing worlds (Last Lantern, Neon Afterhours, Mossgrove) appear as world tiles with cover art, rendered with the default Parley theme.
3. Clicking a world tile creates a default instance (if none exists) and routes to L2 with the world's `theme.yaml` applied — at minimum, palette and backdrop should differ visibly between worlds.
4. Clicking a story template on L2 creates a story instance and routes to L3.
5. L3 shows the full-bleed scene backdrop, narration with inline portraits, an input field, and at least two suggested intents. Submitting a player action runs a turn through the agent author seam and appends to the transcript.
6. The recency rail on L1 routes directly into the most recent in-progress story instance.
7. The truth-verdict panel is no longer visible in the play screen; rejected turns surface as inline pills only.
8. All existing `node --test` suites pass against the new server endpoints (with appropriate test updates). Tests still exercise `createScenarioFixtureAuthor` directly, not via the new UI.
9. The instance/template directory split (`instances/<world-id>/<instance-id>/...`) is in place and old `worlds/<id>/state/` directories are migrated.

## Acceptance Criteria — Part 2

1. The three flagship worlds (`verdant-aria`, `night-city-after-curfew`, `gentle-shore`) are installed and selectable from L1.
2. Side-by-side screenshots of L2 across the three worlds are unmistakably different products.
3. `night-city-after-curfew` ships a `shell: "custom"` bundle that owns its L2/L3 root render.
4. The other two ship `shell: "default"` with substantial `componentStyles` overrides + at least one slot component each.
5. All three pass acceptance criteria 4–6 from Part 1.

## Future Work (out of scope for Part 1 + Part 2)

- World registry / marketplace install flow.
- World template authoring UI (creating a new world from scratch).
- Per-turn backdrop generation (currently per-scene only).
- World import / export (sharing instances).
- Multi-user accounts, sync, cloud saves.
- i18n shipping (Hermes exposes `useI18n` in its SDK; we expose the hook but ship no translations yet).
- Audio cue hooks (gentle-shore design references sound cues; the actual audio pipeline is future).

## Open Questions

- Should `shell: "custom"` worlds be loaded via dynamic `import()` from `dist/worlds/<id>/entry.js`, or via `<script type="module">` injection? Both work; dynamic import is cleaner but couples world bundle URLs to Vite's hashing.
- For instance naming: should the user be prompted on first instance creation, or always auto-name? Currently: auto-name to `Playthrough N`, renameable from L2. Open to feedback.
- For the `__PARLEY_SDK__.api` surface: should world bundles be allowed to call `runTurn` directly, or only the shell? Locking to the shell is safer; allowing it gives flagship worlds more freedom. Recommendation: shell-only for now, revisit when first `shell: "custom"` world ships.

## References

- [Hermes Agent — Web Dashboard docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- [Hermes Agent — Extending the Dashboard docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard)
- [NousResearch/hermes-agent on GitHub](https://github.com/NousResearch/hermes-agent)
- [Strike Freedom Cockpit (Hermes ceiling reference)](https://github.com/NousResearch/hermes-agent/tree/main/plugins/strike-freedom-cockpit)
- [minutechreview/hermes-dashboard-themes](https://github.com/minutechreview/hermes-dashboard-themes) — community theme variance
- [0xNyk/awesome-hermes-agent](https://github.com/0xNyk/awesome-hermes-agent) — curated index
- [Hermes issue #18289 — pluggable theme engine + marketplace](https://github.com/NousResearch/hermes-agent/issues/18289)
- [Hermes issue #18080 — theme readability](https://github.com/NousResearch/hermes-agent/issues/18080)
