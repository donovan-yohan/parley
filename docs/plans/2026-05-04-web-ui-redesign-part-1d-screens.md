# Web UI Redesign — Part 1d Implementation Plan (L1/L2/L3 Screens + Demo Cleanup)

> **For agentic workers:** Use superpowers:subagent-driven-development. 4 review checkpoints (routing, screens, cleanup, tests).

**Goal:** Replace the single-page UX shape with the new three-level navigation (L1 Landing → L2 World homebase → L3 Story play). Land scene backdrop + inline portraits + rejection-pill UX. Remove every demo-era artifact: scenario dropdown, visible truth-verdict panel, old `src/client/`, `/api/scenarios`, `?scenario=` query param. After this PR the shell is the actual product (sans flagship demo worlds — those land in Part 2).

**Architecture:** Hash-based routing via History API (`#/`, `#/world/<id>/<inst>`, `#/world/<id>/<inst>/story/<sid>`); avoids needing a new dep. Each screen is a standalone Preact component receiving its route params. Shell state (current world manifest, world themes loaded) lives in a tiny module-level store; component-local UI state via `useState`. World skin applies whenever route is L2 or L3 — `applyTheme(worldId)` fires on enter, removes on L1.

**Tech Stack:** No new deps. Reuse `@parley/sdk` primitives + slot consumers from 1c.

**Source spec:** `docs/specs/2026-05-04-web-ui-redesign-design.md` — sections "Information Architecture", "Screen Designs", "States per screen", "L2 instance switcher", "Story instance lifecycle", "Demo Cleanup".

---

## File Structure

**New:**
- `src/shell/router.ts` — hash-based route parser + tiny pub-sub for navigation. Exports `useRoute()` hook + `navigate(path)`.
- `src/shell/state/worldStore.ts` — module-level store: cached world summaries, currently-applied theme world id. Subscribers re-render on change.
- `src/shell/pages/Landing.tsx` — L1.
- `src/shell/pages/WorldHome.tsx` — L2 (story list + instance switcher popover + state subgroups for completed/abandoned).
- `src/shell/pages/StoryPlay.tsx` — L3 (backdrop + transcript with inline portraits + input + suggested intents + rejection pill).
- `src/shell/components/InlinePortrait.tsx` — round 42px avatar + nameplate beside speech paragraph (the recommended A treatment from Q8 brainstorm).
- `src/shell/components/RecencyRail.tsx` — L1 "Continue playing" linear list.
- `src/shell/components/InstanceSwitcher.tsx` — L2 popover: instance list + rename + delete + "+ new playthrough".
- `src/shell/components/RejectionPill.tsx` — inline error pill on L3 when a turn is rejected.
- `src/shell/styles/screens.css` — per-screen layout css. Reads CSS vars set by theme cascade.
- `test/shell-routing.test.js` — route parser + navigation.
- `test/page-landing.test.js` — L1 user flow (click world → routes to L2; click recency → routes to L3).
- `test/page-world-home.test.js` — L2 user flow (click story template → creates instance + routes to L3; instance switcher rename + delete).
- `test/page-story-play.test.js` — L3 user flow (submit player action → transcript appends; mid-turn input disabled; rejection → pill).
- `test/demo-cleanup.test.js` — old endpoints + scenario dropdown removed (verifies absence).

**Modified:**
- `src/shell/main.tsx` — replace `<SinglePageApp />` mount with router-driven `<App />`. Subscribe to route changes.
- `src/server.js` — REMOVE `GET /api/scenarios`, REMOVE `?scenario=` query param handling on `GET /api/state`, REMOVE legacy `{scenarioId, playerAction}` shape on `POST /api/turn` (back-compat ends here). New shape `{worldId, instanceId, storyId, playerAction}` becomes the only accepted shape. Update `truthAuthority`'s rejection signaling so the API surfaces a `{verdict: "revise", rejectionMessage: string}` field on rejected turns.
- `package.json` — remove `validate:pr10` script if no longer needed (check).
- Smoke scripts (`scripts/smoke-parley-runtime.mjs`, `smoke-parley-e2e.mjs`, `smoke-parley-scenarios.mjs`) — update calls from old shape to new shape so they still pass.

**Removed:**
- `src/client/index.html`, `src/client/app.js`, `src/client/styles.css` — entire directory deleted. (Note: `src/shell/styles.css` is a copy of the old client css that 1b made — this stays under shell/.)
- `src/shell/SinglePageApp.tsx` — replaced by the router-driven `App` + page components.

---

## Group A — Routing + Store Infrastructure (PARALLEL within, one commit)

### A1: Hash router (`src/shell/router.ts`)
- Pure module: `parseRoute(hash: string): Route` returns `{ kind: "landing" | "worldHome" | "storyPlay", worldId?, instanceId?, storyId? }`.
- Listens to `hashchange`; module-level subscriber list.
- Exports `useRoute()` hook (Preact) + `navigate(path: string)` function.
- No deps.

### A2: World store (`src/shell/state/worldStore.ts`)
- Module-level state: `worlds: WorldSummary[]`, `appliedThemeWorldId: string | null`.
- Functions: `loadWorlds()`, `applyThemeForWorld(worldId)`, `clearTheme()` — calls into `loadWorldTheme.ts`.
- `useStore<T>(selector)` hook returns selected slice + re-renders on change.

### A3: Per-screen base CSS (`src/shell/styles/screens.css`)
- `.l1-landing`, `.l2-worldhome`, `.l3-storyplay` containers with grid/flex layouts. All colors via CSS vars set by theme cascade. L1 uses default Parley vars; L2/L3 use the active world's vars.

**Checkpoint A:** `npm test` — 279 baseline still pass. `npm run build` succeeds with the new modules but no screens yet.

Commit: `feat(1d): hash router + world store + screen base styles`

---

## Group B — L1 + L2 + L3 Pages (one subagent, sequential)

### B1: `src/shell/pages/Landing.tsx` (L1)
- Renders the tile grid (3-col, 3:4 aspect tiles per Q7 Pattern B mock) + the "Continue playing" recency rail below.
- World tiles read from `worldStore.worlds` (loaded at mount).
- Recency rail aggregates `getStories(worldId, instanceId)` results across all worlds, filters `status: "in_progress"`, sorts by `lastPlayedAt`, top 5–10.
- Empty state: when no worlds installed (impossible for now, but render it anyway).
- Click world tile → if instances exist, route to most-recent. Otherwise call `createInstance(worldId)` then route to that instance's L2.
- Click recency item → route directly to that story's L3.
- Visible "‹ Parley" exit affordance is hidden on L1 (we're already there); shown on L2/L3.

### B2: `src/shell/pages/WorldHome.tsx` (L2)
- Applies world theme on mount (via worldStore), removes on unmount.
- Header: world name + tone + the `‹ Parley` exit + the `<InstanceSwitcher>` popover (only when >1 instance exists).
- Body: story list. Group story templates with their instances inline. Below `in_progress` group: `<details>`-collapsed `Completed` + `Archived` groups (the latter renders status `"abandoned"` — data-layer name kept, UI label is "Archived").
- Click story instance → route to L3 (resume).
- Click story template → call `createStory(worldId, instanceId, templateId)` + route to L3 (new instance).
- Loading/empty/error states per spec's "States per screen" subsection.

### B3: `src/shell/pages/StoryPlay.tsx` (L3)
- Applies world theme on mount.
- Renders `<SceneBackdrop>` (slot consumer from 1c) full-bleed.
- Transcript reads from `getStory(...)` on mount. Updates appended on submit.
- Each turn rendered in three patterns:
  - Narration paragraph (no speaker) → full-width.
  - Speaker dialogue → `<InlinePortrait>` left + `<DialogueFrame>` content right.
  - Player action → italicized prefixed paragraph.
- Input + suggested intents (`<ChoiceList>`) inside `<DialogueFrame>` slot consumer.
- On submit:
  - Disable input + show spinner near input.
  - Call `runTurn(...)`.
  - If turn returns ok, append to transcript.
  - If turn returns rejection (verdict revise): show `<RejectionPill>` inline near input — does NOT modify transcript.
- Truth verdict panel: NOT rendered. Settings menu has a debug toggle that flips local state to render the full verdict (low priority — can be a placeholder button that does nothing in 1d).

### B4: `src/shell/components/InlinePortrait.tsx`
- Props: `{ characterId, characterName, avatarSrc?, children }`.
- Renders 42px round avatar (or initial-letter fallback when no src) + uppercase name label above the dialogue paragraph (children).

### B5: `src/shell/components/RecencyRail.tsx`
- Props: `{ items: StorySummary[], onSelect: (item) => void }`.
- Vertical list, max-height with scroll.

### B6: `src/shell/components/InstanceSwitcher.tsx`
- Props: `{ worldId, currentInstanceId }`.
- Popover anchored to the world title; lists instances + rename + delete + "+ new playthrough".
- Rename: optimistic update + PUT to a new endpoint (or PATCH).
- Delete: confirm modal + DELETE endpoint.

### B7: `src/shell/components/RejectionPill.tsx`
- Inline error pill rendered just under input on L3 when a turn is rejected.

### B8: `src/shell/main.tsx` rewrite
- Replace `<SinglePageApp>` with `<App>` that uses `useRoute()` to switch between `<Landing>` / `<WorldHome>` / `<StoryPlay>`.
- `<SinglePageApp>` file deleted.

### B9: Endpoint additions for instance rename/delete
- `PATCH /api/instances/:worldId/:instanceId` body `{displayName}` — update `instance.json`.
- `DELETE /api/instances/:worldId/:instanceId` — remove the instance directory (use `rm -rf` semantics with the existing `repoRoot` constraint).

**Checkpoint B:** Manual smoke — open dev server, click through L1 → L2 → L3 → L1; verify theme transitions between worlds; submit a turn end-to-end. typecheck clean. `npm test` still passes (no new tests yet — those land in Group D).

Commit: `feat(1d): L1/L2/L3 pages with hash routing + inline portraits + rejection pill`

---

## Group C — Demo Cleanup (one subagent or me, sequential)

### C1: Delete `src/client/`
- `git rm -r src/client/`. The shell uses `src/shell/styles.css` (1b copied the styles); confirm no broken `<link>` references.

### C2: Remove old endpoints from `src/server.js`
- Remove `GET /api/scenarios` handler.
- Remove `?scenario=` handling from `GET /api/state` (and remove `GET /api/state` entirely if nothing else needs it — check).
- Remove the legacy `{scenarioId, playerAction}` body shape on `POST /api/turn`. New shape `{worldId, instanceId, storyId, playerAction}` is the only accepted shape.

### C3: Update smokes
- `scripts/smoke-parley-runtime.mjs` — call `POST /api/turn` with new shape. Still pass.
- `scripts/smoke-parley-e2e.mjs` — same.
- `scripts/smoke-parley-scenarios.mjs` — switch from `/api/scenarios` to `/api/worlds`. Adjust assertions.

### C4: Acceptance verification
- Confirm `curl http://127.0.0.1:4173/api/scenarios` returns 404.
- Confirm `curl http://127.0.0.1:4173/api/state?scenario=last-lantern` returns 404 (or returns something but ignores `?scenario=`).

**Checkpoint C:** All three smoke scripts pass against new endpoints. `curl /api/scenarios` 404. `npm test` still passes (some tests may need updating for new endpoint shape — handle them here, not in Group D).

Commit: `chore(1d): remove src/client/, /api/scenarios, ?scenario=, legacy /api/turn shape`

---

## Group D — Tests (PARALLEL)

### D1: `test/shell-routing.test.js` [PARALLEL]
- `parseRoute('#/')` → landing.
- `parseRoute('#/world/last-lantern/playthrough-1')` → worldHome with ids.
- `parseRoute('#/world/last-lantern/playthrough-1/story/rain-at-the-crossroads')` → storyPlay.
- `parseRoute(invalid)` → falls back to landing.
- `navigate(path)` updates `location.hash`.

### D2: `test/page-landing.test.js` [PARALLEL]
- L1 renders 3 world tiles for installed worlds.
- Tile click with no instance → calls createInstance, navigates to `#/world/<id>/playthrough-1`.
- Recency rail filters in_progress only.
- Recency rail click → navigates to story L3.

### D3: `test/page-world-home.test.js` [PARALLEL]
- Story templates listed; instances grouped under templates.
- Story template click → calls createStory, navigates to L3.
- Instance switcher rename hits PATCH endpoint.
- Instance switcher delete hits DELETE + redirects.

### D4: `test/page-story-play.test.js` [PARALLEL]
- Submit player action → fires runTurn, transcript appends.
- Mid-turn input disabled.
- Rejection (verdict: revise) → RejectionPill shows, transcript unchanged.

### D5: `test/demo-cleanup.test.js` [PARALLEL]
- `GET /api/scenarios` returns 404.
- `POST /api/turn` with `{scenarioId, playerAction}` returns 400.
- `src/client/` directory absent (filesystem check).

**Checkpoint D:** All new tests pass. Total ~310+ tests. typecheck clean. `npm run build` clean.

Commit (per file or batched): `test(1d): screens + routing + demo cleanup coverage`

---

## Out of scope for 1d (Part 2 only)

- Three flagship demo worlds (verdant-aria, night-city-after-curfew, gentle-shore).
- A `shell: "custom"` world bundle in production (the loader supports it but no world ships one yet).
- World import / export.
