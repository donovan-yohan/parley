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

This spec **does** treat the play screen as **real-agent-shaped** UI from day one. The deterministic-fixture turn author (`createScenarioFixtureAuthor` in `src/runtime/turnAuthor.js`) becomes a test-only fallback; the production shell talks only to the typed `AgentTurnAuthor` interface defined in the Agent-Author Seam section. Part 1b ships against a typed mock that satisfies that interface; the live implementation arrives with `belayer-profile-coupling`. See "Demo Cleanup" for what we are removing.

## Information Architecture

Three navigation levels over four data layers.

### Data layers

| Layer | Path | Mutability |
|---|---|---|
| World template | `worlds/<world-id>/` | Read-only at runtime |
| World instance | `instances/<world-id>/<instance-id>/` | Mutable; cross-story memory lives here |
| Story template | `worlds/<world-id>/scenarios/<story-id>/` | Read-only at runtime |
| Story instance | `instances/<world-id>/<instance-id>/stories/<story-id>/` | Mutable; transcript + per-story canon |

The `instances/` root is introduced by this spec and aligns with the `instance-wiki-authoring` plan. The current `worlds/<id>/state/` directory is migrated to `instances/<world-id>/playthrough-1/` during the cutover (see Migration). All instances — migrated or freshly created — use the `playthrough-N` naming pattern; there is no `default` instance name in the new layout.

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

### L2 instance switcher

When a world has more than one instance, the L2 shell header shows an instance switcher (popover from the world title). The switcher exposes:

- A vertical list of all instances for this world. Each row: instance display name, story count, last-played relative timestamp.
- Click a row → routes to that instance's L2 (full-page transition; replaces current view).
- Inline rename (pencil affordance per row) — edits `instance.json` `displayName`.
- Delete (trash affordance per row, requires confirm) — removes the instance directory; if the deleted instance was the active one, routes to the most-recently-played remaining instance, or to L1 if none remain.
- "+ New playthrough" tile at the bottom of the switcher → creates `instances/<world-id>/playthrough-N/` (next available `N`) and routes to its L2.

The switcher is hidden when only one instance exists; "+ New playthrough" then surfaces as a small affordance in the L2 header.

### Story instance lifecycle

Each `story.json` carries a `status` field with three values:

- `in_progress` — default for newly created story instances; included in the L1 recency rail.
- `completed` — set when the agent author signals scene resolution (or via a future "mark complete" UX). Excluded from the recency rail; visible in L2 under a collapsed "Completed" group.
- `abandoned` — set when the user explicitly archives a story without completing it. Excluded from the recency rail; visible in L2 under a collapsed "Archived" group.

The recency rail on L1 sorts only `in_progress` story instances by `last_played_at` (descending) and shows the top 5–10. L2 lists all stories regardless of status, grouped by status.

### States per screen

Each screen defines loading, empty, and error states explicitly. World-skinned screens (L2/L3) inherit their state styling from the world theme; the structural copy below stays consistent across worlds.

**L1 (Landing):**
- Loading: skeleton grid of 3 placeholder world tiles + 5 placeholder rail rows.
- Empty (no worlds installed): centered message — "No worlds installed yet. Drop a world directory into `worlds/<world-id>/` and refresh." — plus a `Reload` button.
- Error (worlds fetch fails): inline banner with retry — "Could not load your worlds. Retry."

**L2 (World homebase):**
- Loading: world skin applied to a skeleton story list.
- Empty (no story templates): centered message — "This world ships no story templates yet."
- Empty (no story instances): story templates are listed; below them, "No saves yet. Pick a template above to start."
- Error (instance fetch fails): inline banner with retry; falls back to L1 if retry fails twice.

**L3 (Story play):**
- Loading: backdrop + skeleton transcript paragraphs while the first turn is fetched.
- Mid-turn: input disabled, suggested-intent buttons greyed; small spinner near the input.
- Error (turn author 500 / network): inline rejection pill — "The turn could not be authored. Retry." — with a Retry button. Transcript is not mutated until a successful turn lands.
- Asset missing (scene backdrop not found): falls back to a flat `--world-asset-bg-color` (derived from theme palette); does not surface a user-visible error.

### Manifest & theme validation

- `world.json` and `theme.yaml` are validated against Zod schemas in `src/contracts/` (extending the existing `parley-contracts` package on this branch). Schema names: `parley-world/v1` and `parley-theme/v1`.
- On validation failure at world load:
  - Log a structured error to the dev console (and to `instances/<world-id>/load-errors.jsonl` for diagnosis).
  - Fall back to the default Parley theme for that world.
  - Surface a non-blocking dev-only banner on L2/L3 — "Theme failed validation; using default. See `load-errors.jsonl`."
  - Production builds (`NODE_ENV=production`) suppress the banner but keep the log.
- A world that fails to load entirely (missing `world.json` or invalid id) is hidden from L1 with a console warning. L1 never crashes due to a single bad world.

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

## World Plugin Model — `@parley/sdk`

World bundles import the SDK from a real workspace package, `@parley/sdk`, that the shell builds and ships at runtime. This guarantees a single Preact instance (no duplicate hook registries) and gives world authors normal IDE/typecheck ergonomics — no specifier magic.

```ts
// src/sdk/index.ts (the @parley/sdk package entrypoint)
export { h, Fragment } from 'preact';
export { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks';
export { Card, Button, Tabs, PluginSlot, Drawer, Backdrop, ChoiceList } from './components';
export { getWorlds, getInstance, getStory, runTurn } from './api';
export { fetchJSON, cn, timeAgo, useI18n } from './utils';
export { registerSlot, useSlot, type SlotName, type SlotContext } from './slots';
```

```ts
// worlds/last-lantern/shell/slots.tsx
import { h, registerSlot } from '@parley/sdk';
import { LanternDialogueFrame } from './LanternDialogueFrame';

registerSlot('last-lantern', 'dialogue-frame', LanternDialogueFrame);
```

The shell is the only consumer that imports the package "for real" (it bundles the implementation). World bundles import from `@parley/sdk` for typecheck ergonomics, but the Vite externals rule (see Build Pipeline) marks `@parley/sdk` (and `preact`/`preact/hooks` defensively) as external, so world bundles emit bare imports that resolve at runtime against the shell's already-loaded module instance.

The runtime resolution mechanism: the shell's `main.tsx` populates `window.__PARLEY_SDK__` with the same exports object on boot. World bundles emitted with externals use a tiny shim (injected by the build) that aliases `import 'X' from '@parley/sdk'` to `window.__PARLEY_SDK__.X` at module evaluation time. The global is an implementation detail of the shim — world authors only see `@parley/sdk`.

**Slot names** (initial set):

| Slot | Part 1c consumer? | Description |
|---|---|---|
| `scene-backdrop` | yes (L3) | Full-bleed background behind L3. Defaults to `assets/backgrounds/<scene>.png` from the visual-asset pipeline. |
| `dialogue-frame` | yes (L3) | Wrapper around the input + choice list. Default frame is the semi-translucent panel from the L3 design. |
| `header-crest` | registered, inert | Small icon/logo in shell header. Reserved for Part 2 flagship worlds. |
| `header-tagline` | registered, inert | Text right of header crest. Reserved for Part 2. |
| `sidebar-rail` | registered, inert | Vertical rail, present in some layoutVariants (e.g. `cockpit` derivatives). Reserved for Part 2. |
| `inventory-rail` | registered, inert | Optional accessory rail. Reserved for Part 2. |
| `footer-tagline` | registered, inert | Small footer text. Reserved for Part 2. |

"Registered, inert" means the slot infrastructure (`registerSlot`, `useSlot`, the constants in `src/shell/slots.ts`) ships in Part 1c, but no shell component consumes the slot until Part 2 worlds ask for it. Slots are forward-compatible by design.

**`registerSlot` signature and worked example.** A registered slot component is a Preact functional component (NOT a JSX element, NOT a lazy import — the loader resolves lazy imports before calling `registerSlot`). It receives a `SlotContext` prop with `worldId`, `instanceId`, `storyId?`, plus slot-specific props.

```ts
// src/shell/slots.ts
type SlotContext = { worldId: string; instanceId: string; storyId?: string };
type SlotProps<S extends SlotName> = SlotContext & SlotPropsByName[S];
type SlotComponent<S extends SlotName> = (props: SlotProps<S>) => preact.VNode | null;

export function registerSlot<S extends SlotName>(
  worldId: string,
  slot: S,
  component: SlotComponent<S>
): void;
```

```tsx
// worlds/last-lantern/shell/slots.tsx
import { h, registerSlot } from '@parley/sdk';
import { LanternDialogueFrame } from './LanternDialogueFrame';

registerSlot('last-lantern', 'dialogue-frame', LanternDialogueFrame);

// LanternDialogueFrame receives ({ worldId, instanceId, storyId, children }) => VNode
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

**Component style buckets.** Each bucket (`card`, `dialogueFrame`, `header`, `sidebar`, `backdrop`, ...) accepts arbitrary camelCase CSS props that the loader emits as `--component-<bucket-kebab>-<prop-kebab>` variables. Shell components consume these vars. World authors never write selectors.

**Worked example — bucket emission.** Given the YAML:

```yaml
componentStyles:
  dialogueFrame:
    background: "rgba(0,0,0,0.55)"
    borderColor: "rgba(201,163,92,0.25)"
    backdropFilter: "blur(2px)"
```

The loader emits these CSS custom properties on the shell root:

```css
:root[data-world-id="last-lantern"] {
  --component-dialogue-frame-background: rgba(0,0,0,0.55);
  --component-dialogue-frame-border-color: rgba(201,163,92,0.25);
  --component-dialogue-frame-backdrop-filter: blur(2px);
}
```

The shell's `<DialogueFrame>` component reads these directly:

```css
.dialogue-frame {
  background: var(--component-dialogue-frame-background, rgba(0,0,0,0.6));
  border: 1px solid var(--component-dialogue-frame-border-color, rgba(255,255,255,0.1));
  backdrop-filter: var(--component-dialogue-frame-backdrop-filter, none);
}
```

Bucket key transform: `dialogueFrame` (camelCase) → `dialogue-frame` (kebab). Prop key transform: `borderColor` → `border-color`. No deeper nesting is supported in v1; nested objects throw at validation.

**Stylesheet escape hatch.** A world may ship `stylesheet.css` at the world root. **No size cap for the local trusted-world case.** Hermes's 32 KiB `customCSS` cap is the most-cited friction in their community ([issue #18289](https://github.com/NousResearch/hermes-agent/issues/18289)); we skip it for built-in worlds. When the registry / marketplace future-work path lands, this decision must be revisited — community-authored CSS at hundreds of KiB is a real perf hazard and may need a stricter cap or a CSS-only-no-JS budget.

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
2. **Move `worlds/<id>/state/` → `instances/<world-id>/playthrough-1/`.** Each migrated world gets a single instance named `playthrough-1` (matching the auto-creation naming used everywhere else in the new layout). The instance materialization rules from `instance-wiki-authoring` apply; this spec only requires the directory move.

   **Runtime callers of `worlds/<id>/state/` to update in 1a:**

   - `src/runtime/scenarioPacks.js:44` — `stateDir: path.join(repoRoot, "worlds", worldId, "state")`. Replace with the new instance-aware path; emit both `worldDir` and `instanceDir` in the loaded scenario object.
   - `src/runtime/parleyRuntime.js` — every call site that writes `turns.jsonl`, world state JSON, or character markdown into `stateDir`. Update to use `instanceDir`.
   - `src/runtime/truthAuthority.js:115-125` — `buildEvidencePaths` constructs `${stateDir}/turns.jsonl`. Update to read from `instanceDir`.
   - `src/runtime/visualAssets.js` — asset manifest writes are under `worldDir/assets/`, not `stateDir`. **No change required**, but verify the assets path is unaffected by the migration.
   - `src/runtime/belayerCharacterAdapter.js` — `persistCharacterMarkdown` writes into `worldDir`. **No change required** for the world-template path; cross-story character memory in instances is the subject of `belayer-profile-coupling`, not this spec.
   - `src/server.js:74-107` — `serveWorldAsset` reads from `worldDir/assets/`. **No change required**; assets stay under the world template.
   - `test/support/inProcessServer.js` — fixture builders that construct `stateDir` paths must use the new naming. Plus all test files that pass an explicit `stateDir` override.

   PR 1a author works this list. If a new runtime caller has been added to `worlds/<id>/state/` between this spec and 1a's land, grep is the source of truth: `grep -RIn "worlds/.*/state\\|stateDir" src/ test/`.
3. **Add `world.json` and `theme.yaml`** to each existing world. Initial `theme.yaml` reflects each world's existing `art-style.md` palette.
4. **Replace `src/client/`** with `src/shell/` (Preact + Vite). Old client is removed in the same change set, not left as a fallback.
5. **Add API endpoints:** `GET /api/worlds`, `GET /api/instances?world=<id>`, `POST /api/instances` (create), `GET /api/stories?world=<id>&instance=<id>`, `POST /api/stories` (create story instance), `GET /api/story?world=<id>&instance=<id>&story=<id>`, `POST /api/turn` (extended with instance + story ids). Existing `POST /api/turn` is replaced; old `?scenario=` query param is removed.

## Implementation Phases

Part 1 lands as **four stacked PRs** following the project's existing PR-chain convention (PRs #1–#15 chain). Each PR is independently reviewable in the 300–600 LoC range, and each leaves the test suite green.

**Part 1a — Repo migration.** Move `scenarios/<id>/` → `worlds/<world-id>/scenarios/<id>/`. Introduce `instances/<world-id>/<instance-id>/` directory layout and migrate existing `worlds/<id>/state/` content into `instances/<world-id>/playthrough-1/`. Add `world.json` manifest stubs to each world. Update `src/runtime/scenarioPacks.js` and tests. No UI changes in this PR.

The minimum `world.json` stub shape Part 1a must produce (theme/stylesheet/shell can land in 1c):

```json
{
  "schema_version": "parley-world/v1",
  "id": "last-lantern",
  "name": "Last Lantern",
  "premise": "...",
  "tone": "...",
  "scenarios": ["..."]
}
```

**Part 1b — Preact shell + SDK + agent-author seam stub.** Replace `src/client/` with `src/shell/` (Preact + Vite + TS). Stand up `__PARLEY_SDK__`, the slot system infrastructure (no consumers yet), the typed agent-author seam (mocked — see Agent-Author Seam below), and the new API endpoints. The shell renders the existing UX shape (single-page, scenario picker, transcript) so reviewers can verify the framework swap is behaviour-preserving. No new screens, no theme cascade in this PR.

**Part 1c — Theme cascade + slot system wiring.** Implement the `theme.yaml` palette + `color-mix()` cascade, `componentStyles` bucket emission, `layoutVariant` data-attribute, asset slot CSS vars, and the slot-system consumers (`<DialogueFrame>`, `<SceneBackdrop>`). Add Zod schemas for `world.json` and `theme.yaml` in `src/contracts/`. Land `theme.yaml` files for the existing three worlds. Old single-page UI from 1b still renders, now with worlds applying their themes.

**Part 1d — New screens + demo cleanup.** Implement L1, L2, L3 from the Screen Designs section. Remove the scenario dropdown, the visible truth-verdict panel, the old `src/client/`, and any smoke scripts coupled to the demo UI. This is the PR that flips the user-facing experience from "Preact-shell-renders-old-UX" to "Preact-shell-renders-new-IA."

**Part 2 — Three flagship demo worlds.** Build three themed worlds whose sole purpose is to demonstrate the depth of the override system. Each ships its own `theme.yaml`, `stylesheet.css`, slot components, and `layoutVariant`. At least one of the three uses `shell: "custom"` to demonstrate the rung-6 ceiling.

## Agent-Author Seam

Part 1 cannot wait on `belayer-profile-coupling` (PR #15+, currently a five-PR runtime stack with nothing merged). Instead, Part 1b lands a **typed mock turn-author** that mirrors the eventual production contract.

The minimal contract Part 1b must define so the shell can ship without waiting on the runtime stack:

```ts
// src/runtime/agentAuthor.ts (Part 1b)

export interface TurnInput {
  worldId: string;
  instanceId: string;
  storyId: string;
  turnId: string;          // monotonic per story instance
  playerAction: string;
  scene: { id: string; name: string };
  // Subject to widening when belayer-profile-coupling lands.
  // Anything beyond these fields the live author needs (e.g. talent profile refs)
  // is added then; shell code is unaffected because the SDK calls the seam, not the author directly.
}

export interface AuthoredTurn {
  responseId: string;
  narration: string;
  speakers: Array<{ characterId: string; quote: string }>;
  nextChoices: string[];
  proposedFacts: ProposedFact[];   // existing parley-fact contract
  // Optional fields the live author may emit; shell renders them if present.
  storyConsequence?: StoryConsequence | null;
  beatRedirect?: BeatRedirect | null;
}

export interface AgentTurnAuthor {
  id: string;
  mode: 'mock-agent' | 'live-agent';
  authorTurn(input: TurnInput): Promise<AuthoredTurn>;
}

export function createMockAgentTurnAuthor(): AgentTurnAuthor {
  // Returns a deterministic-but-shaped-like-real turn.
  // Same response shape as the eventual belayer-profile-coupling author.
  // Used for the new shell's smoke + integration tests.
}
```

The shape is derived from current `runTurn` call sites in `src/runtime/parleyRuntime.js` plus the contract surfaces already in `src/contracts/` from PR #11. Anything `belayer-profile-coupling` adds (talent profile pointers, wake transport, etc.) widens this interface without breaking the shell.

The shell only knows about `AgentTurnAuthor`. When `belayer-profile-coupling` lands its production author, we drop in a `createLiveAgentTurnAuthor()` that satisfies the same interface; no shell code changes.

The legacy `createScenarioFixtureAuthor` (`src/runtime/turnAuthor.js`) stays untouched for the existing 142-test suite. It is not used by the new shell.

## Build Pipeline

Single Vite project at the repo root. Two output trees:

- `dist/` — the shell (`src/shell/main.tsx` as entry).
- `dist/worlds/<world-id>/` — one entry per world that opts into `shell: "custom"` (discovered at build time by scanning `worlds/*/world.json` for `"shell": "custom"`).

```ts
// vite.config.ts (sketch)
import { defineConfig } from 'vite';
import { discoverCustomShellWorlds } from './scripts/discover-worlds';

const customShellWorlds = discoverCustomShellWorlds(); // [{ id, entryPath }]

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        shell: 'src/shell/index.html',
        ...Object.fromEntries(
          customShellWorlds.map(({ id, entryPath }) => [`worlds/${id}`, entryPath])
        )
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'shell' ? 'assets/shell-[hash].js' : `${chunk.name}/entry-[hash].js`,
      },
      // CRITICAL: do not double-bundle Preact or @parley/sdk in world bundles.
      // World bundles resolve these to the shell's already-loaded module instance at runtime.
      external: (id, importer) =>
        importer?.includes('/worlds/') &&
        (id === 'preact' ||
          id.startsWith('preact/') ||
          id === '@parley/sdk' ||
          id.startsWith('@parley/sdk/'))
    }
  }
});
```

World bundles MUST NOT bundle Preact, hooks, or `@parley/sdk` themselves; the externals predicate above enforces this and the loader rejects world bundles that try.

### Worlds-loader runtime contract

Lazy-loaded on world-tile click. Build emits `dist/world-manifest.json` mapping world-id to its hashed entry URL.

```ts
// dist/world-manifest.json (emitted by Vite at build time)
{
  "schema_version": "parley-world-manifest/v1",
  "worlds": {
    "last-lantern":           { "shell": "default", "entryUrl": null },
    "verdant-aria":           { "shell": "default", "entryUrl": "worlds/verdant-aria/entry-a3f9.js",          "integrity": "sha384-..." },
    "night-city-after-curfew": { "shell": "custom",  "entryUrl": "worlds/night-city-after-curfew/entry-b7c1.js", "integrity": "sha384-..." }
  }
}
```

- Shell fetches `world-manifest.json` once at boot (~1 KB) and caches in memory for the session.
- `shell: "default"` worlds with no slot components have `entryUrl: null` and skip the bundle fetch entirely (theme.yaml + stylesheet.css are still loaded as static assets).
- On world-tile click, loader: (a) reads manifest entry, (b) if `entryUrl` is non-null, dynamic-imports the bundle with subresource-integrity verification, (c) waits for the bundle to call `registerSlot` / register its custom shell, (d) routes to L2.
- Bundle load failures (404, integrity mismatch, eval error) fall back to default shell + log + dev banner. L2 still renders.
- Manifest staleness (e.g., user has an old SPA in cache, server has new manifest) is a non-issue at our scale; no cache-busting beyond Vite's filename hashing.

### Security posture (parallel to the no-CSS-cap caveat)

`shell: "custom"` world bundles run in the main thread with full DOM, fetch, and SDK access. **This is acceptable only because all worlds in Part 1 + Part 2 are first-party (built-in).** When the registry / marketplace future-work path lands, this decision must be revisited — community-authored bundles are arbitrary code with full save-data access. The registry path requires either:

- Per-world `<iframe sandbox>` with a postMessage SDK proxy (Hermes-style isolation), or
- A signed-bundle review pipeline with curation gates, or
- A combination of both.

The shell's slot-component contract was deliberately designed to survive an iframe boundary (slot components receive serializable props only — no callbacks, no shared closures), so the future migration is achievable without a slot-API rewrite.

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

## Test Plan — Part 1

Each PR ships its own tests covering the code paths it introduces. Per the eng-review decision, all 30 new code paths land tested in their respective PRs (not deferred). The three regression risks are mandatory test-migration work and gate their respective PRs.

**Part 1a (migration) tests:**
- Update every test that constructs a `stateDir` path explicitly. Source of truth: `grep -RIn "stateDir\\|worlds/.*/state" test/`.
- Add: `instances/<world-id>/playthrough-1/` materialization tests for each existing world (idempotent re-run, fresh creation).
- Migrate: any test fixture building paths under `scenarios/<id>/scenario.json` to `worlds/<world-id>/scenarios/<id>/scenario.json`.

**Part 1b (shell + SDK + agent-author seam stub) tests:**
- `src/sdk/api.ts` unit tests — `getWorlds`, `getInstance`, `getStory`, `runTurn` (mock + error paths).
- `src/sdk/slots.ts` unit tests — `registerSlot` registration, duplicate-registration handling, race condition (registration after `useSlot`'s first call), unregistered-slot fallback.
- `src/runtime/agentAuthor.ts` unit tests — `createMockAgentTurnAuthor` returns shape-conformant `AuthoredTurn` for every `TurnInput` field combination; interface conformance test asserting future `createLiveAgentTurnAuthor` will satisfy the same contract.
- `src/worlds-loader/` unit tests — `fetchManifest` happy path + 404, `loadWorldBundle` integrity verification + 404 + eval-error fallback.
- **Regression:** migrate every test that hits `POST /api/turn` to the new `(worldId, instanceId, storyId, playerAction)` shape; migrate every test that hits `GET /api/scenarios` to `GET /api/worlds`; remove every test fixture using `?scenario=` query params (replaced by path parameters).
- Smoke test: shell boots, fetches `world-manifest.json`, no SDK initialization errors.

**Part 1c (theme cascade + slot system wiring + Zod) tests:**
- `src/shell/theme/apply.ts` golden tests — given a known `theme.yaml`, assert the exact CSS custom-property string emitted on the shell root element. Cover camelCase→kebab transformation edge cases (`backdropFilter` → `--backdrop-filter`).
- `src/shell/theme/tokens.ts` golden tests — assert `color-mix()` derived tokens for a known palette.
- `src/contracts/world.ts` Zod tests — accept every shipped `world.json` (Last Lantern, Neon, Mossgrove); reject malformed cases (missing `id`, wrong `schema_version`, invalid `shell` enum).
- `src/contracts/theme.ts` Zod tests — accept every shipped `theme.yaml`; reject malformed cases (palette missing required color, `density` outside enum, `customCSS` over a configurable max if a cap is reintroduced for registry).
- Slot-system integration tests: slot fallback to default when no world registers, slot override when world registers, default re-applied when world unloads.

**Part 1d (new screens + demo cleanup) tests:**
- L1 user-flow tests — first-time empty state, recency rail filter (`in_progress` only), tile click creates `playthrough-1` and routes.
- L2 user-flow tests — instance switcher rename, delete + redirect, +new playthrough auto-numbers (`playthrough-2`, `playthrough-3`), story template click creates story instance, completed/abandoned grouping.
- L3 user-flow tests — submit player action through the seam, transcript appends, mid-turn input disabled, rejection pill on `verdict: "revise"`, backdrop missing → flat color fallback.
- Story lifecycle tests — `in_progress` → `completed` transition removes from recency rail, `abandoned` likewise.
- Theme failure tests — malformed `theme.yaml` falls back to default theme + dev banner; missing `world.json` hides the world from L1.
- Demo cleanup verification — old `src/client/` removed, `/api/scenarios` 404s, scenario dropdown gone from rendered HTML.

Each PR's CI runs the full `node --test` suite. PRs that break a test from a prior PR cannot merge until the breakage is reconciled.

## Bundle Size Budgets

Part 1 enforces explicit JS payload budgets via a post-build script (`scripts/check-bundle-budgets.mjs`) that parses Vite's build output and fails CI if any entry exceeds its budget.

| Entry | Budget (gzip) | Rationale |
|---|---|---|
| Shell (`dist/assets/shell-[hash].js`) | ≤ 150 KB | Preact core + components + theme apply + slots + worlds-loader + agent-author seam + 3 page components. Generous enough not to fight; tight enough to flag scope creep. |
| `shell: "default"` world bundle | ≤ 15 KB | Just slot components + small initialization code. |
| `shell: "custom"` world bundle | ≤ 100 KB | Full L2/L3 root takeover. Allows substantial UI but caps the rung-6 ceiling at a reasonable size. |
| `world-manifest.json` | ≤ 4 KB | Should stay tiny; only world IDs + entry URLs + integrity hashes. |

Initial budgets are best-guess; first-real-build measurements may justify tuning. Tuning is a one-line spec-amend, not a code rewrite.

## Acceptance Criteria — Part 1

1. Running `npm start` opens the new L1 landing on `http://localhost:4173`.
2. The three existing worlds (Last Lantern, Neon Afterhours, Mossgrove) appear as world tiles with cover art, rendered with the default Parley theme.
3. Clicking a world tile creates a `playthrough-1` instance (if none exists) and routes to L2 with the world's `theme.yaml` applied — at minimum, palette and backdrop should differ visibly between worlds.
4. Clicking a story template on L2 creates a story instance and routes to L3.
5. L3 shows the full-bleed scene backdrop, narration with inline portraits, an input field, and at least two suggested intents. Submitting a player action runs a turn through the agent author seam and appends to the transcript.
6. The recency rail on L1 routes directly into the most recent in-progress story instance.
7. The truth-verdict panel is no longer visible in the play screen; rejected turns surface as inline pills only.
8. All existing `node --test` suites pass against the new server endpoints (with appropriate test updates). Tests still exercise `createScenarioFixtureAuthor` directly, not via the new UI.
9. The instance/template directory split (`instances/<world-id>/<instance-id>/...`) is in place and old `worlds/<id>/state/` directories are migrated.
10. CI's bundle-budget check passes: shell ≤ 150 KB gzip; each `shell:"default"` world ≤ 15 KB gzip; each `shell:"custom"` world ≤ 100 KB gzip; `world-manifest.json` ≤ 4 KB.

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
- The Part 2 codenames (`verdant-aria`, `night-city-after-curfew`, `gentle-shore`) reference well-known IPs. Spec stance: theme inspirations only, no licensed assets, no IP names in shipped strings or repo paths beyond the codenames. Re-confirm before any publishable release.

## References

- [Hermes Agent — Web Dashboard docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- [Hermes Agent — Extending the Dashboard docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard)
- [NousResearch/hermes-agent on GitHub](https://github.com/NousResearch/hermes-agent)
- [Strike Freedom Cockpit (Hermes ceiling reference)](https://github.com/NousResearch/hermes-agent/tree/main/plugins/strike-freedom-cockpit)
- [minutechreview/hermes-dashboard-themes](https://github.com/minutechreview/hermes-dashboard-themes) — community theme variance
- [0xNyk/awesome-hermes-agent](https://github.com/0xNyk/awesome-hermes-agent) — curated index
- [Hermes issue #18289 — pluggable theme engine + marketplace](https://github.com/NousResearch/hermes-agent/issues/18289)
- [Hermes issue #18080 — theme readability](https://github.com/NousResearch/hermes-agent/issues/18080)
