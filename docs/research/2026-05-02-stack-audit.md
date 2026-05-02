# Parley Stack Audit — 2026-05-02

## TL;DR

Current Parley is a good local-first vertical slice, not a frontend base we should keep piling UI on forever.

The right direction is:

1. Keep the local Node runtime and file-backed world artifacts.
2. Add real contracts/schemas before multiplying scenes.
3. Move the UI to **Vite + React + TypeScript + Tailwind v4 + Radix/shadcn-style primitives** when we start serious frontend work.
4. Treat theming as first-class world data, not a later CSS cleanup.
5. Add deterministic story/eval harnesses before trusting generated prose.

The current vanilla UI is fine as proof. If we keep adding panels, theming, state, and accessibility by hand, this turns into bespoke sludge. bro i can already smell the 900-line CSS file forming in the walls.

## Repo inspected

Worktree:

```text
/Users/donovanyohan/Documents/Programs/personal/parley-worktrees/stack-audit-ui-prose-research
```

Base branch:

```text
nightshift/codex-ui-runtime
```

Verification at audit time:

```bash
npm test
npm run smoke:runtime
```

Both passed in the parent session before this document was written.

## Current stack inventory

| Layer | Current stack | Evidence |
|---|---|---|
| Runtime/package | Node ESM, Node >=20, no dependencies | `package.json` |
| Server | Hand-written `node:http` server | `src/server.js` |
| API | `GET /api/state`, `POST /api/turn` | `src/server.js` |
| Client | Static HTML + vanilla JS + CSS | `src/client/index.html`, `src/client/app.js`, `src/client/styles.css` |
| Persistence | File-backed JSON/JSONL state | `worlds/last-lantern/state/`, `src/runtime/parleyRuntime.js` |
| Truth authority | Deterministic mock verdict layer | `src/runtime/truthAuthority.js` |
| Belayer seam | Generated talent adapter | `src/runtime/belayerCharacterAdapter.js` |
| Tests | Node built-in test runner | `test/parley-runtime.test.js` |

## Dependency freshness

There are currently **no external dependencies**, so there are no outdated packages.

That is not the same as “the stack is ready.” It means all frontend richness currently has to be hand-built.

Current likely package targets from npm research:

| Package | Latest observed |
|---|---:|
| vite | 8.0.10 |
| typescript | 6.0.3 |
| react | 19.2.5 |
| @vitejs/plugin-react | 6.0.1 |
| tailwindcss | 4.2.4 |
| daisyui | 5.5.19 |
| shadcn | 4.6.0 |
| svelte | 5.55.5 |
| @sveltejs/kit | 2.59.0 |
| vue | 3.5.33 |

## What is good now

- One-command local slice exists.
- No auth/database/deployment drag.
- The runtime boundary is clean enough for a first pass.
- World/character/truth docs are richer than the code, which is the correct direction.
- The UI already has a coherent dark fantasy palette through CSS variables.
- Tests prove the Mara/old-north-road smoke path.

## Architecture risks

### 1. Contract drift

Docs define richer shapes than runtime returns. Examples:

- Character docs expect richer identity, knowledge, provenance, visual metadata.
- Runtime currently returns flattened tags and `belayerGeneratedTalent` directly.
- Truth docs expect fuller findings/state deltas.
- Runtime returns compact accepted/rumor/unresolved lists.

This is survivable now. It becomes a mess if we add more UI before real schemas.

**Recommendation:** add JSON Schema or Zod-style validators and make runtime output match docs.

### 2. The UI is not hydrated from persisted state

`/api/state` exists, but the client starts with a hardcoded transcript. That makes the UI feel like a demo, not a saveable RPG surface.

**Recommendation:** load persisted state on startup and render from a single state model.

### 3. Choice elements are clickable list items

Clickable `<li>` elements are not enough. They need real buttons for keyboard and accessibility.

**Recommendation:** choice cards should be buttons with clear state: normal, risky, locked, story-critical.

### 4. Current theming is one palette, not a theme system

`styles.css` has variables, but only one dark tavern theme. There is no world-level theme JSON, layout variant, speaker color map, density control, or custom CSS slot.

**Recommendation:** define a `theme` contract with semantic tokens and world presets.

### 5. Persistence can race

Turn IDs based on JSONL count plus multi-file writes are fine for one local player. They are not safe for concurrent submits.

**Recommendation:** local write queue/file lock before any real multi-turn concurrency.

### 6. Runtime is still one hardcoded scene

The current runtime always goes through Mara/Last Lantern. That proves the loop, not emergent story.

**Recommendation:** introduce scene/character registries, then a deterministic planner seam.

## Frontend base options

### Option A, recommended: Vite + React + TypeScript + Tailwind v4 + Radix/shadcn-style primitives

Best fit because:

- aligns with the repo’s own `AGENTS.md` suggested stack,
- gives accessible primitives without Next.js gravity,
- supports rich custom theming,
- easy for coding agents to reason about,
- keeps the tiny Node API intact.

Use this when the UI becomes more than the current proof.

### Option B: SvelteKit + TypeScript + Tailwind/DaisyUI

Best “least boilerplate” option. DaisyUI theme presets are attractive for proving fantasy/cyberpunk/cozy skins.

Tradeoff: a bigger framework commitment and less aligned with the likely React-heavy agent tooling ecosystem.

### Option C: Vue 3 + Vite + Tailwind/DaisyUI or PrimeVue

Good but not clearly better than React or Svelte here.

### Option D: stay vanilla

Acceptable for the current slice only. Not recommended for serious theming, panel composition, or multi-screen RPG UX.

## Recommended near-term architecture

```text
src/runtime/          deterministic story/runtime engine
src/contracts/        schemas + generated/shared types
src/client/           Vite React UI, later
worlds/<id>/          lore, characters, scenes, themes, state
scripts/eval/         deterministic + LLM eval harnesses
```

## Immediate implementation priorities

1. Add research docs and design direction.
2. Improve current UI without over-investing in vanilla.
3. Add theme presets as a proof, high fantasy / cyberpunk / cozy.
4. Translate developer-facing state into player-facing journal/NPC/lead language.
5. Add an e2e smoke script that reads real outputs and checks:
   - Mara appears as reusable NPC.
   - Turn creates lore/state artifacts.
   - Output defines lore/characters, not prewritten story.
   - Player action creates emergent next beats.
6. After that, do the Vite/React migration as a separate stacked PR.

## Recommendation

Do **not** migrate the frontend base in this audit PR. First prove the target UX and story/prose direction cheaply on the vanilla slice. Then migrate once we know the shape.

That avoids rewriting into React and then realizing the layout model is wrong. very funny, very software, absolutely not doing that twice.
