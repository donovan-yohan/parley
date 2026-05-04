# Web UI Redesign — Part 2 Implementation Plan (Three Flagship Demo Worlds)

> **For agentic workers:** Use superpowers:subagent-driven-development. Three world-builds run in parallel as independent subagents (each touches its own world dir + bundle output, zero overlap). One review checkpoint per world.

**Goal:** Build three intentionally-distinct themed worlds that stress-test the override system. Side-by-side screenshots of L2 across them must be unmistakably different products. One world (`night-city-after-curfew`) ships `shell: "custom"` to demonstrate the rung-6 ceiling.

**Architecture:** Three new world directories under `worlds/`, each with `world.json`, `theme.yaml`, `stylesheet.css`, `scenarios/<one-scenario>/scenario.json`, and per-world slot components (or, for `night-city-after-curfew`, a full `shell/entry.tsx` bundle). Worlds-loader's manifest discovery (1c) automatically picks them up.

**Tech Stack:** No new deps. Authoring exercise — pure CSS / theme YAML / Preact slot components against the SDK from 1b/1c.

**Source spec:** `docs/specs/2026-05-04-web-ui-redesign-design.md` — sections "Implementation Phases — Part 2", "Acceptance Criteria — Part 2".

---

## Three flagship worlds

| Codename | Inspiration | Theme angle | layoutVariant | shell |
|---|---|---|---|---|
| `verdant-aria` | Final Fantasy (early SNES era — ATB/world-map vibe) | Ornate serif + jewel palette + gold filigree borders, scrolling banner-style choices | `noir` (overridden — rich color, ornate chrome) | `default` + heavy `componentStyles` |
| `night-city-after-curfew` | Cyberpunk 2077 | Glitched neon, magenta + cyan, holographic UI, scanline overlay, monospace + Orbitron display, HUD-style stat bars | `hud` | `custom` — flagship reference for shell takeover |
| `gentle-shore` | Animal Crossing | Pastel sky gradients, rounded chunky shapes, hand-letter display font, paper-card dialogue with bobbing portraits | `cozy` | `default` + slot overrides for `dialogue-frame` and `scene-backdrop` |

These are theme inspirations only — no licensed assets, no IP names in shipped strings beyond the codenames themselves. Cover art uses the existing prompt-pipeline format (`assets/backgrounds/<scene>.prompt.md`); actual PNG generation is future work and not blocking. Worlds render with theme palette as backdrop fallback.

## Per-world file structure

Each world ships:

```
worlds/<codename>/
├── world.json           — parley-world/v1
├── theme.yaml           — parley-theme/v1
├── stylesheet.css       — extra CSS (no size cap; uncapped per spec)
├── art-style.md         — design notes (informal)
├── characters/          — character markdown like existing worlds
├── lore/                — world bible
├── scenes/              — scene records
├── scenarios/<one>/scenario.json   — one starter scenario
├── assets/
│   ├── backgrounds/<scene>.prompt.md     — visual asset prompts
│   └── portraits/<character>.prompt.md
└── (only night-city-after-curfew):
    └── shell/entry.tsx  — custom shell bundle entry
```

For `night-city-after-curfew`, the world.json declares `"shell": "custom"`. The build's `discover-worlds` script picks it up and Vite's multi-entry config emits `dist/worlds/night-city-after-curfew/entry-[hash].js`. The world-manifest.json then has a non-null `entryUrl` for it.

## Group A — Three worlds in parallel (PARALLEL subagents, separate commits)

Each subagent owns ONE world. No file overlap. Three worlds → three concurrent dispatches.

### Lane A1: `verdant-aria` (FF-inspired, shell:default)
- `world.json` declares `"shell": "default"`, `"layoutVariant": "noir"`.
- `theme.yaml` palette: deep navy `#0a0e3d` bg, royal purple `#5b3387` mid, ivory `#f5e8c8` fg. warmGlow gold `rgba(212,175,55,0.22)`. fontDisplay Cinzel, fontSans Spectral, fontMono JetBrains Mono. layout.density comfortable. componentStyles.dialogueFrame: gold filigree border (`borderImage`), ivory backdrop, serif baseline. componentStyles.choiceList: scrolling banner styling (each choice has a left/right banner end via background-image SVG inline data-uri). Aim for SNES JRPG menu vibe.
- `stylesheet.css`: extra detail — ornate underline on speaker names, slow gradient pulse on `.l3-storyplay` background.
- `worlds/verdant-aria/shell/slots.tsx` — registerSlot for `header-crest` (small heraldic crest SVG inline) and `dialogue-frame` (override the default with a gold-bordered box).
- One scenario: `scenarios/song-of-the-broken-crown/scenario.json`. Story: a wandering bard at a tavern hears a song that names a crown lost in the war. Cast: 2-3 NPCs (the bard, the tavernkeep, a hooded patron). 5-6 turn responses. Uses the existing `parley-scenario/v1` shape — mirror the structure of `worlds/last-lantern/scenarios/last-lantern/scenario.json`.

### Lane A2: `night-city-after-curfew` (Cyberpunk2077-inspired, shell:custom)
- `world.json` declares `"shell": "custom"`, `"layoutVariant": "hud"`. `entryUrl` is implicit — the build will emit it.
- `theme.yaml` palette: black `#0a0a0f` bg, deep magenta `#3d0a3d` mid, cyan `#00f0ff` fg. warmGlow magenta `rgba(255,0,200,0.4)`. fontMono "Share Tech Mono", fontDisplay Orbitron. layout.density compact. componentStyles.card: notched corners (`clipPath`), magenta accent stripe. customCSS via stylesheet: scanline overlay, glitch animation on hover, holographic shimmer on choice buttons.
- `worlds/night-city-after-curfew/shell/entry.tsx` — full custom shell. Imports from `@parley/sdk`. Renders L2 + L3 with completely custom layout: HUD-style stat bars (turn counter as a "system uptime" gauge), scanline overlay div, neon-bordered dialogue boxes with corner brackets, monospace everywhere. L1 is NOT custom — every world's L1 entry is the neutral Parley shell. So `shell:custom` only takes over L2 + L3 routes. Use `useRoute()` from the shell — but wait, the shell router is single-instance. The custom shell entry registers itself as a render override for routes `worldHome` + `storyPlay` when the active world is `night-city-after-curfew`. Implementation: the world's entry.tsx calls `__PARLEY_PLUGINS__.registerCustomShell(worldId, { renderWorldHome, renderStoryPlay })` — this requires extending the SDK slightly (see "SDK Extension" below).
- One scenario: `scenarios/silver-shard-extraction/scenario.json`. Cast: a netrunner contact, a corp scout, an AI fragment. 5-6 turns.

### Lane A3: `gentle-shore` (Animal Crossing-inspired, shell:default)
- `world.json` declares `"shell": "default"`, `"layoutVariant": "cozy"`.
- `theme.yaml` palette: peach-cream `#fff4e0` bg, soft sage `#a8d5a8` mid, warm brown `#5c4a3a` fg. fontDisplay Fraunces (already in 1c), fontSans Quicksand. layout.density spacious. componentStyles.dialogueFrame: chunky 1.25rem border-radius, paper-card drop shadow, warm beige fill. componentStyles.choiceList: rounded button per choice with bobbing animation. customCSS: pastel sky gradient backdrop, subtle paper texture.
- `worlds/gentle-shore/shell/slots.tsx` — registerSlot for `dialogue-frame` (override with paper-card style + slight bob animation) and `scene-backdrop` (gradient sky + soft cloud SVG layer).
- One scenario: `scenarios/seashell-festival/scenario.json`. Cast: festival organizer Daffodil, retiree neighbor Marigold, missing-cat seeker child Hazel. 5-6 turns.

## SDK Extension (small)

Currently the shell renders `<App>` based on `useRoute()`. For `shell: "custom"` worlds to take over L2/L3, we need a registration hook:

- `src/sdk/customShell.ts` — exports `registerCustomShell(worldId, { renderWorldHome, renderStoryPlay })`.
- `src/shell/main.tsx` — when route enters L2/L3 for a worldId that has registered a custom shell, render that world's components instead of the default pages.
- The shell's `useRoute()` and store APIs remain the source of truth for navigation; custom shells only own the render output.

This is the only shell-side change in Part 2. Land it as the first commit, before the worlds.

## Group A0 — SDK customShell extension (one commit)
- Add `src/sdk/customShell.ts` with `customShellRegistry: Map<worldId, { renderWorldHome, renderStoryPlay }>` + `registerCustomShell()`. Export from `@parley/sdk`.
- Modify `src/shell/main.tsx` `<App>` to consult the registry when the active route is L2 or L3. If a custom shell is registered for that world, render its render functions; otherwise render the default page components.
- Add `test/sdk-custom-shell.test.js` covering registration + lookup.

Commit: `feat(part-2): customShell registration extension to @parley/sdk`

## Group B — Visible-product validation (one commit)

Once all three worlds + the SDK extension are in:
- Manual smoke: open dev server, click each of the six world tiles (3 existing + 3 new), confirm L2 looks visibly different per world. Take screenshots.
- Verify `night-city-after-curfew`'s L3 looks completely different from the default shell render.
- Verify `verdant-aria` and `gentle-shore` use `shell: "default"` but feel distinct from each other and from the existing three worlds.
- Add `test/part-2-acceptance.test.js`:
  - All three flagship worlds appear in `GET /api/worlds`.
  - Each ships a valid `theme.yaml` (Zod parse).
  - `night-city-after-curfew` declares `shell: "custom"` in its world.json.
  - `dist/world-manifest.json` after build has entryUrl non-null for night-city-after-curfew.

Commit: `test(part-2): acceptance coverage for flagship worlds`

---

## Out of scope for Part 2 (Future Work)

- World registry / marketplace (still future).
- Audio cue pipeline (gentle-shore references it but doesn't ship it).
- Real PNG art for the new worlds — only `.prompt.md` placeholders. Theme palette serves as backdrop fallback.
- Per-turn backdrop generation.
- Parallel multi-instance UX beyond rename/delete.
