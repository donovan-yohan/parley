# Belayer Profile Coupling Implementation Plan

> **For Hermes / agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Tasks marked [PARALLEL] inside a single PR can run in independent subagents simultaneously. Tasks marked [SEQUENTIAL] depend on prior tasks in the same PR. PRs themselves are stacked — each PR depends on the prior PR being merged.

**Goal:** Couple Parley actors and crags to Belayer's new per-talent Hermes profile substrate so NPCs gain durable cross-story memory inside a world instance, while Parley keeps owning story canon.

**Architecture:** Five stacked PRs after a hard prerequisite (PR #11 — Zod contracts from issue #13). Each PR ships independently, leaves the JS runtime working, and unlocks the next layer. World **instance** (not template) maps to a Belayer crag; each named NPC maps to a per-talent Hermes profile fork (`blyr-<crag>-<character>`); private belief lives in profile `MEMORY.md`; public canon lives in Parley story-instance event log; wake transport rides Belayer mail.

**Tech Stack:** Node 20, ESM, `node --test`, vanilla file-backed runtime, Zod for schema validation (added in PR #11), shell-out to `belayer` CLI for daemon/mail/profile operations (replace with native SDK later).

**Source of truth design doc:** `~/.gstack/projects/donovan-yohan-parley/donovanyohan-main-design-20260504-005002.md` (eng-reviewed, D1-D8 incorporated).
**Eng review artifact:** `~/.gstack/projects/donovan-yohan-parley/donovanyohan-main-eng-review-20260504-005002.md`.
**Parent epic:** GitHub issue #15 (children #16-#20).
**Hard prerequisite:** GitHub issue #13 / PR #11 (TypeScript + Zod contract layer).

---

## PR Roadmap

| PR | Branch | Base | Scope | Depends on | Parallelism | GitHub issue |
|---|---|---|---|---|---|---|
| **#11 (PR #21)** | `feat/zod-contracts-pr11` | `main` | Zod contract layer scaffold | none | YES (independent schema files) | #13 |
| **#12 (PR-A+B)** | `feat/instances-materialization` | `feat/zod-contracts-pr11` | Instance materialization + `.belayer-talent.yaml` writes | #11 | YES (per-character migrations) | #15, #16 |
| **#13 (PR-C0+C merged)** | `feat/belayer-wake-transport` | `feat/instances-materialization` | Belayer process integration spike + wake envelope + transport | #12 | YES (envelope schemas + helpers) | #17 |
| **#14 (PR-D + PR-E partial)** | `feat/tool-bundles-events` | `feat/belayer-wake-transport` | Tool catalog + per-wake narrowing + per-story events.jsonl + pulse | #13 | YES (tool defs + event modules) | #18, #19 |
| **#15 (PR-F + Live UI)** | `feat/live-ui-wiring` | `feat/tool-bundles-events` | Live UI wiring: SSE event stream, indexer query surfaces, real portrait/background gen via `background-artist` + `portrait-artist` Belayer talents using Hermes Nous tool gateway image skills | #14 | YES (UI + image talents are independent within PR) | #19 (partial), #20 |

---

## Critical contract pins (DO NOT DRIFT)

These are load-bearing. Subagents must match them exactly.

- **Filename:** `.belayer-talent.yaml` (NOT `talent.yaml`). Verified `belayer/internal/cli/prune.go:283-300`.
- **Required fields in `.belayer-talent.yaml`:** `profile_name`, `talent_name`, `crag_slug`, `memory_scope`, `materialized_at`.
- **`memory_scope` must equal `"crag"` for resumable NPCs.** If missing, Belayer defaults to `"climb"` and prunes the profile at climb end → silent break of cross-story memory.
- **Profile name regex:** `^[a-z0-9][a-z0-9_-]{0,63}$` (Hermes limit).
- **Profile name format:** `blyr-<crag>-<talent>` (5 + crag ≤ 25 + 1 + talent ≤ 33 = 64).
- **Wake envelope `current_story_context` is required**, not optional. Carries `story_id`, `scene_id`, `current_turn_id`, `present_event_refs`.
- **Private memory tools tag with `story_id`.** Without it, NPC belief becomes one undifferentiated bucket.
- **GM lifecycle: `resident` per-story-session.** Cross-story signal via `world-instance-evaluation/v1` artifact at story end, NOT via accumulated GM `MEMORY.md`.
- **Per-story-instance `events.jsonl`**, NOT per-world-instance.
- **Wake timeout default: 60 seconds.** On timeout: emit `wake_deferred`, GM narrates around it, story continues.

---

# PR #11 — TypeScript + Zod contract layer

**Scope:** Add TS toolchain + Zod schemas for already-proven artifacts (PR #10 detour shapes). NO runtime `.js → .ts` migration. NO new validation CLI yet (defer to PR #12 in original #13 plan).

**Acceptance:** existing JS runtime + smokes pass; `npm run typecheck` clean; `npm run test:contracts` passes; PR #10 detour artifacts validate through Zod.

## PR #11 Tasks

### [PARALLEL] Task 11.1 — Toolchain scaffold

**Files:**
- Modify: `package.json` (add devDeps + scripts)
- Create: `tsconfig.json`
- Create: `src/contracts/.gitkeep`

**Steps:**
- [ ] Add devDeps: `typescript@^5.5`, `tsx@^4.19`, `zod@^3.23`, `@types/node@^20.14`.
- [ ] Add scripts: `"typecheck": "tsc --noEmit"`, `"test:contracts": "node --import tsx --test test/contracts/*.test.ts"`.
- [ ] Write `tsconfig.json`: `target: ES2022`, `module: ES2022`, `moduleResolution: bundler`, `strict: true`, `noEmit: true`, `allowImportingTsExtensions: true`, `include: ["src/contracts/**/*.ts", "test/contracts/**/*.ts"]`.
- [ ] Run `npm install`.
- [ ] Run `npm run typecheck` — expect clean (no contracts yet).
- [ ] Commit: `chore(contracts): scaffold TypeScript + Zod toolchain`.

### [PARALLEL] Task 11.2 — `common.ts` shared schemas

**Files:**
- Create: `src/contracts/common.ts`
- Create: `test/contracts/common.test.ts`

**Steps:**
- [ ] Write Zod schemas: `TurnId` (`z.string().regex(/^turn-[0-9a-f]{8,}$/)`), `IsoDateTime` (`z.string().datetime({ offset: true })`), `WorldId`, `SceneId`, `CharacterId`, `CragSlug` (`z.string().regex(/^[a-z0-9][a-z0-9_-]{0,24}$/)`, max 25 chars), `TalentName` (`z.string().regex(/^[a-z0-9][a-z0-9_-]{0,32}$/)`, max 33 chars — Belayer budget is 64 - 5("blyr-") - 25(crag) - 1("-") = 33). Plus generic helper `schemaVersion<V extends string>(literal: V)` returning `z.literal(literal)` for use by per-artifact schemas (preserves literal type via `z.infer`).
- [ ] Test: each schema accepts a valid value and rejects an invalid one. Use `node:test` + `node:assert/strict`.
- [ ] Commit: `feat(contracts): add common Zod primitives`.

### [PARALLEL] Tasks 11.3–11.7 — Per-artifact schemas (one task per file)

Each task is independent. Subagents can run all 5 in parallel.

**Common shape per task:**
- Create the schema file under `src/contracts/`.
- Create the matching test file under `test/contracts/`.
- Test: round-trip a fixture from `examples/last-lantern/artifacts/` through `Schema.parse(JSON.parse(...))`.
- Test: at least 2 negative cases (unknown field rejected, missing required field rejected).
- Commit per task.

| Task | Schema | File | Source artifact |
|---|---|---|---|
| **11.3** | `parley-action-interpretation/v1` | `src/contracts/actionInterpretation.ts` | `examples/last-lantern/artifacts/action-interpretation-*.json` (or generated via existing detour test) |
| **11.4** | `parley-story-attractor/v1` | `src/contracts/storyAttractor.ts` | scenario pack attractors |
| **11.5** | `parley-detour-scene/v1` | `src/contracts/detourScene.ts` | DM detour test fixtures |
| **11.6** | `parley-story-consequence/v1` | `src/contracts/storyConsequence.ts` | DM detour test fixtures |
| **11.7** | `parley-beat-redirect/v1` | `src/contracts/beatRedirect.ts` | DM detour test fixtures |

### [SEQUENTIAL] Task 11.8 — `index.ts` re-exports + parse helpers

**Files:**
- Create: `src/contracts/index.ts`
- Create: `src/contracts/parseHelpers.ts`
- Create: `test/contracts/parseHelpers.test.ts`

**Steps:**
- [ ] `index.ts`: re-export every schema + `z` from "zod".
- [ ] `parseHelpers.ts`: `safeParseWithFieldErrors(schema, value)` returns `{ ok: true, data }` or `{ ok: false, errors: [{ path, message }] }` formatted for actor consumption.
- [ ] Test: helper formats unknown-field error path correctly.
- [ ] Run `npm run test:contracts` — expect all pass.
- [ ] Commit: `feat(contracts): add index + parse helpers`.

### [SEQUENTIAL] Task 11.9 — Smoke validate against PR #10 outputs

**Files:**
- Create: `scripts/validate-pr10-artifacts.mjs`

**Steps:**
- [ ] Script loads each `state/{action-interpretations,detour-scenes,story-consequences,beat-redirects}.jsonl` from a recently-played scenario.
- [ ] Validates each line against the matching Zod schema via `safeParseWithFieldErrors`.
- [ ] Exits non-zero if any line fails.
- [ ] Run against existing `worlds/last-lantern/state/` — expect clean (or fix any drift).
- [ ] Commit: `test(contracts): validate PR #10 artifacts via Zod`.

### Task 11.10 — Open PR #11

- [ ] Push branch `pr/11-zod-contract-layer`.
- [ ] Open PR titled "feat(contracts): TypeScript + Zod contract layer (closes #13 partially)".
- [ ] PR body includes: scope-out (no runtime migration, no CLI), follow-up plan (PR-A+B unblocks).

---

# PR-A+B — Instance materialization + character→talent binding

**Scope:** New `instances/<world-id>/<instance-id>/` directory layer. CLI: `parley instance materialize`. Each named NPC gets a Belayer talent profile materialized with `.belayer-talent.yaml`. Existing scenarios keep working via `default_instance` field + `parley migrate-scenario`.

**Acceptance:** existing scenarios smoke-pass via auto-materialized default instance; `belayer doctor --crag <id>` reports clean for any new instance; profile-name budget validator rejects oversized inputs; talent profile materialized once, not per turn.

## PR-A+B Tasks

### [SEQUENTIAL] Task AB.1 — Add `instances/` layout schema (Zod)

**Files:**
- Create: `src/contracts/instance.ts`
- Create: `src/contracts/belayerTalentMetadata.ts`
- Create: `test/contracts/instance.test.ts`
- Create: `test/contracts/belayerTalentMetadata.test.ts`

**Steps:**
- [ ] `instance.ts`: `ParleyInstanceManifestSchema` with `schema_version: "parley-instance-manifest/v1"`, `world_id`, `instance_id`, `crag_slug`, `created_at`, `default_story_id?`.
- [ ] `belayerTalentMetadata.ts`: `BelayerTalentMetadataSchema` matching `.belayer-talent.yaml` exactly. Required fields: `profile_name`, `talent_name`, `crag_slug`, `memory_scope` (enum `["climb", "crag", "talent"]`), `materialized_at` (ISO datetime).
- [ ] Tests: round-trip + reject `memory_scope: "session"` (not in enum).
- [ ] Commit: `feat(contracts): add instance manifest + belayer talent metadata schemas`.

### [SEQUENTIAL] Task AB.2 — Profile-name budget validator

**Files:**
- Create: `src/runtime/instances/profileNameBudget.js`
- Create: `test/instances/profileNameBudget.test.js`

**Steps:**
- [ ] Export `validateProfileNameBudget(cragSlug, talentName)` returning `{ ok, profileName, errors? }`.
- [ ] Hard limit: `5 + cragSlug.length + 1 + talentName.length <= 64`.
- [ ] Regex check both slugs against `/^[a-z0-9][a-z0-9_-]{0,63}$/`.
- [ ] Tests: happy path (`last-lantern-alpha`, `mara-underbough`); over-limit (33 + 35 char names); invalid chars (uppercase, leading hyphen).
- [ ] Commit: `feat(instances): add profile-name budget validator`.

### [SEQUENTIAL] Task AB.3 — `.belayer-talent.yaml` writer

**Files:**
- Create: `src/runtime/instances/talentProfileMaterializer.js`
- Create: `test/instances/talentProfileMaterializer.test.js`

**Steps:**
- [ ] Export `materializeTalentProfile({ cragSlug, talentName, memoryScope, hermesProfilesRoot })` that:
  - validates name budget
  - creates `<hermesProfilesRoot>/blyr-<crag>-<talent>/` if missing
  - writes `.belayer-talent.yaml` with required fields + `materialized_at: new Date().toISOString()`
  - returns `{ profileDir, profileName }`
- [ ] YAML write uses simple key-value (no library); validates round-trip via `BelayerTalentMetadataSchema`.
- [ ] Tests: writes correct file; rejects `memory_scope: "climb"` for resumable NPCs (caller's bug, but lint at writer); idempotent re-materialization (no clobber unless `force: true`).
- [ ] Commit: `feat(instances): add .belayer-talent.yaml writer with schema validation`.

### [PARALLEL] Task AB.4 — Instance manifest writer

**Files:**
- Create: `src/runtime/instances/materializeInstance.js`
- Create: `test/instances/materializeInstance.test.js`

**Steps:**
- [ ] Export `materializeInstance({ worldId, instanceId, repoRoot, hermesProfilesRoot })`:
  - reads `worlds/<worldId>/WORLD.md` and `worlds/<worldId>/characters/*.md`
  - creates `instances/<worldId>/<instanceId>/manifest.json` (validates via `ParleyInstanceManifestSchema`)
  - creates `instances/<worldId>/<instanceId>/world/` (copies template character md files)
  - calls `belayer crag init <instanceId>` via subprocess (capture exit code)
  - for each named character: invokes `materializeTalentProfile`
  - writes `instances/<worldId>/<instanceId>/CRAG.yaml` linking the Belayer crag
- [ ] Tests: end-to-end materialization in a `mkdtemp` sandbox (mock `belayer` subprocess); profile name budget enforced; existing instance refuses to clobber.
- [ ] Commit: `feat(instances): add full instance materializer`.

### [PARALLEL] Task AB.5 — `parley instance materialize` CLI

**Files:**
- Create: `scripts/parley-instance-materialize.mjs`
- Modify: `package.json` (add `"instance:materialize": "node scripts/parley-instance-materialize.mjs"`)

**Steps:**
- [ ] CLI args: `--world <id> --as <instance-id> [--hermes-profiles-root <path>]`.
- [ ] Defaults `hermes-profiles-root` to `~/.hermes/profiles/`.
- [ ] Calls `materializeInstance`; prints clear actionable errors on failure (especially profile-name-budget).
- [ ] Exit non-zero on error.
- [ ] Manual verify: `npm run instance:materialize -- --world last-lantern --as last-lantern-alpha`.
- [ ] Commit: `feat(cli): add parley instance materialize`.

### [PARALLEL] Tasks AB.6.1 / AB.6.2 / AB.6.3 — Per-world template `default_instance` declaration

Three independent file edits. Subagents can run in parallel.

**Common steps per world:**
- [ ] Edit `worlds/<world-id>/WORLD.md` adding YAML frontmatter or section: `default_instance: <world-id>-default`.
- [ ] Confirm character template files have stable `id` (matches Belayer talent name regex).

| Task | World |
|---|---|
| **AB.6.1** | `worlds/last-lantern/` |
| **AB.6.2** | `worlds/neon-afterhours/` |
| **AB.6.3** | `worlds/orchard-welcome/` |

Single commit at end (not per-world): `feat(worlds): declare default_instance for all world templates`.

### [SEQUENTIAL] Task AB.7 — Migration: `parley migrate-scenario`

**Files:**
- Create: `scripts/parley-migrate-scenario.mjs`
- Modify: `examples/last-lantern/scene.yaml` (rename `crag: last-lantern` → `instance: last-lantern-default`)
- Modify: `scenarios/last-lantern/scenario.json` (similar field rename if present)

**Steps:**
- [ ] CLI args: `--scenario <id>`. Reads existing `crag:` field, rewrites to `instance:`, materializes the world's default instance if not already present.
- [ ] Run script against all three scenarios; commit the rewritten files.
- [ ] Commit: `chore(scenarios): migrate crag→instance field via parley migrate-scenario`.

### [SEQUENTIAL] Task AB.8 — Decouple per-turn talent construction

**Files:**
- Modify: `src/runtime/parleyRuntime.js:45-47` (replace inline `buildScenarioCharacter` loop with read-from-instance)
- Modify: `src/runtime/belayerCharacterAdapter.js` (mark `buildScenarioCharacter` and `buildMaraUnderbough` as legacy with runtime warning, OR move to a new `legacy/` subdir as test-only)
- Create: `src/runtime/instances/loadInstanceCharacters.js`
- Create: `test/instances/loadInstanceCharacters.test.js`

**Steps:**
- [ ] Export `loadInstanceCharacters({ instanceDir, sceneId })` that reads `instances/<world>/<instance>/world/characters/*.md` + applies scene-scoped tags overlay (the `scene:<id>` tag injection currently in `buildScenarioCharacter`).
- [ ] In `runPlayerTurn`, replace the inline build with `loadInstanceCharacters`.
- [ ] Run existing `test/parley-runtime.test.js` — expect pass after fixing test setup to materialize an instance first.
- [ ] Run `npm run smoke:e2e` against all three scenarios — expect pass.
- [ ] Commit: `refactor(runtime): load characters from materialized instance, not per-turn build`.

### [SEQUENTIAL] Task AB.9 — Belayer doctor smoke

**Files:**
- Create: `scripts/smoke-belayer-doctor.mjs`

**Steps:**
- [ ] Materialize a test instance into `mkdtemp` sandbox.
- [ ] Shell out to `belayer doctor --crag <test-instance-id>` (using `--hermes-profiles-root` override env var if Belayer supports; otherwise runs only when `BELAYER_E2E=1` set).
- [ ] Assert exit code 0 + parse output for "clean" indicator.
- [ ] Add to `package.json` as `"smoke:belayer-doctor": "..."`.
- [ ] Commit: `test(instances): smoke check belayer doctor against materialized profiles`.

### Task AB.10 — Open PR-A+B

- [ ] Branch `pr/ab-instance-materialization`.
- [ ] PR title: `feat(instances): materialize world instances + .belayer-talent.yaml profiles (closes #15 partial, #16 partial)`.

---

# PR-C0 — Belayer process integration spike

**Scope:** Sequential probe. Validate daemon lifecycle, mail send/receive, auth preflight, timeout handling. Output: a single integration helper module + a documented "what works / what doesn't" addendum to the design doc.

**Acceptance:** smoke test demonstrates a successful round-trip mail send to a dormant talent profile + assertion that response comes back through Belayer events; daemon-down case produces actionable error.

## PR-C0 Tasks

### [SEQUENTIAL] Task C0.1 — Belayer process bridge module

**Files:**
- Create: `src/runtime/belayer/belayerProcess.js`
- Create: `test/belayer/belayerProcess.test.js`

**Steps:**
- [ ] Export `belayerAuthEnsure()`, `belayerCragExists(cragSlug)`, `belayerMailSend({ cragSlug, talentName, body, clientEventId })`, `belayerDaemonStatus()`.
- [ ] Each function shells out to the `belayer` CLI; parses JSON output if available.
- [ ] On `ENOENT` (binary missing): throw `BelayerNotInstalledError` with install instructions.
- [ ] Tests: mock subprocess via dependency injection; verify command + args; verify error handling for missing binary, non-zero exit, malformed output.
- [ ] Commit: `feat(belayer): add subprocess bridge for daemon/auth/mail`.

### [SEQUENTIAL] Task C0.2 — Wake timeout + retry helper

**Files:**
- Create: `src/runtime/belayer/wakeTimeout.js`
- Create: `test/belayer/wakeTimeout.test.js`

**Steps:**
- [ ] Export `awaitWakeResponse({ clientEventId, timeoutMs = 60000, pollIntervalMs = 500 })`.
- [ ] Polls Belayer event stream (or filesystem-poll fallback) for matching response.
- [ ] On timeout: returns `{ status: "wake_deferred", clientEventId }`.
- [ ] Tests: simulated late response (resolves before timeout); timeout case (resolves wake_deferred); idempotent retry with same clientEventId.
- [ ] Commit: `feat(belayer): add wake timeout + retry helper`.

### [SEQUENTIAL] Task C0.3 — Manual smoke + design doc addendum

**Files:**
- Create: `scripts/smoke-belayer-roundtrip.mjs` (manual, gated behind `BELAYER_E2E=1`)
- Create: `docs/plans/2026-05-04-belayer-profile-coupling-c0-findings.md`

**Steps:**
- [ ] Smoke script: materialize instance → start belayer daemon → send mail → await response → assert.
- [ ] Run manually against a real `belayer daemon`; document outcome in findings doc.
- [ ] If unrecoverable issues found, escalate before PR-C.
- [ ] Commit: `docs(plans): record PR-C0 spike findings`.

### Task C0.4 — Open PR-C0

- [ ] Branch `pr/c0-belayer-process-spike`.
- [ ] PR title: `feat(belayer): process integration spike (probe for #17)`.

---

# PR-C — Wake envelope + transport

**Scope:** `parley-wake/v1`, `parley-wake-result/v1`, `parley-actor-action/v1` Zod schemas. Wake handler that routes NPC turns through Belayer mail. Idempotency via `wake_id`/`client_event_id`. `current_story_context` carries cross-story scoping (D5).

**Acceptance:** dormant resumable NPC wakes via mail, returns wake-result; replay with same `wake_id` is a no-op; daemon-down emits `wake_deferred`.

## PR-C Tasks

### [PARALLEL] Tasks C.1 / C.2 / C.3 — Wake schemas (one task per file)

| Task | Schema | File |
|---|---|---|
| **C.1** | `parley-wake/v1` | `src/contracts/parleyWake.ts` |
| **C.2** | `parley-wake-result/v1` | `src/contracts/parleyWakeResult.ts` |
| **C.3** | `parley-actor-action/v1` | `src/contracts/parleyActorAction.ts` |

**Common steps per task:**
- [ ] Create schema file.
- [ ] **Wake schema (C.1) MUST include required `current_story_context` object** with required `story_id`, `scene_id`, `current_turn_id`, `present_event_refs[]`. Reject if missing.
- [ ] Create test file with positive + 2 negative cases.
- [ ] Commit per task.

### [SEQUENTIAL] Task C.4 — Wake handler

**Files:**
- Create: `src/runtime/wake/wakeNpc.js`
- Create: `test/wake/wakeNpc.test.js`

**Steps:**
- [ ] Export `wakeNpc({ instanceDir, characterId, wakeEnvelope })`:
  - validates envelope via `ParleyWakeSchema`
  - resolves talent profile name via `validateProfileNameBudget`
  - sends Belayer mail via `belayerMailSend` with `client_event_id = wakeEnvelope.wake_id`
  - awaits response via `awaitWakeResponse`
  - validates response via `ParleyWakeResultSchema`
  - returns the result, OR `{ status: "wake_deferred", reason }` on timeout
- [ ] Tests (mocked Belayer): happy round-trip; replay same wake_id returns same result; timeout returns wake_deferred; daemon-down returns wake_deferred with reason.
- [ ] Commit: `feat(wake): NPC wake handler with idempotency + timeout fallback`.

### [SEQUENTIAL] Task C.5 — Hook into parleyRuntime

**Files:**
- Modify: `src/runtime/parleyRuntime.js` (when a turn requires NPC speech, route through `wakeNpc` for resumable NPCs; resident NPCs stay synchronous)
- Add tests verifying the routing decision

**Steps:**
- [ ] Determine wake-vs-direct based on `character.lifecycle === "resumable"`.
- [ ] On `wake_deferred`: GM emits a "Mara seems distracted" narration and continues the turn.
- [ ] Existing tests must still pass.
- [ ] Commit: `feat(runtime): route resumable NPC turns through wake transport`.

### Task C.6 — Open PR-C

- [ ] Branch `pr/c-wake-transport`.
- [ ] PR title: `feat(wake): parley-wake/v1 transport over Belayer mail (closes #17)`.

---

# PR-D — Tool bundle catalog + per-wake narrowing

**Scope:** Baseline NPC tool catalog (per #18 candidate list). Per-wake narrowing via `BELAYER_TOOLS` env or wake envelope `allowed_tools`. DM detour tools wrapped as primitives. Two write-paths defined: profile-side (mail-to-self → MEMORY.md) vs instance-side (Parley API → events.jsonl), each tool tagged.

**Acceptance:** NPC cannot call GM-only tools (authority lint test); private tool writes carry `story_id`; existing detour tests still pass when wrapped.

## PR-D Tasks

### [SEQUENTIAL] Task D.1 — Tool catalog manifest

**Files:**
- Create: `src/runtime/tools/catalog.json`
- Create: `src/contracts/toolCatalog.ts`
- Create: `test/contracts/toolCatalog.test.ts`

**Steps:**
- [ ] Schema: array of `{ name, inputs, outputs, side_effect, authority: "actor"|"gm-only"|"validator-only"|"lifecycle", write_path: "profile-private"|"instance-public"|"none" }`.
- [ ] Catalog includes all tools from #18 list (speak, emote, move, set_activity, ask_player, remember_private, remember_public, update_relationship, set_intention, revise_belief, surface_lead, create_rumor, propose_fact, record_consequence, request_scene_shift, reject_claim, deflect, wake_done, wake_abort).
- [ ] Test: catalog validates; every actor-tier tool has `write_path` set; gm-only tools include `propose_fact`, `record_consequence`.
- [ ] Commit: `feat(tools): baseline NPC tool catalog`.

### [PARALLEL] Tasks D.2 / D.3 — Per-write-path handlers

| Task | Path | File |
|---|---|---|
| **D.2** | profile-private (mail-to-self → MEMORY.md) | `src/runtime/tools/profilePrivateWriter.js` |
| **D.3** | instance-public (Parley API → events.jsonl) | `src/runtime/tools/instancePublicWriter.js` |

**Common steps per task:**
- [ ] Export single writer function taking `{ instance, character, tool, args, storyId }`.
- [ ] **D.2 (profile-private) MUST tag every write with `story_id`** (D5 enforcement). Sends a self-mail to the character's own profile to append to `MEMORY.md`.
- [ ] D.3 appends a structured event to `instances/<world>/<instance>/<story-id>/state/events.jsonl`.
- [ ] Tests: round-trip; missing `story_id` rejected (D.2 only).
- [ ] Commit per task.

### [SEQUENTIAL] Task D.4 — Per-wake authority narrowing

**Files:**
- Create: `src/runtime/tools/narrowToolBundle.js`
- Create: `test/tools/narrowToolBundle.test.js`

**Steps:**
- [ ] `narrowToolBundle({ catalog, characterAuthority, allowedTools? })` returns the subset of tools the character can call this wake.
- [ ] Default narrowing: `actor` characters get all `authority: "actor"` tools; never gm-only.
- [ ] If `allowedTools` provided in wake envelope: intersect with default.
- [ ] Output is set as `BELAYER_TOOLS` env var when calling `belayerMailSend`.
- [ ] Tests: NPC default excludes gm-only; explicit narrowing further reduces; over-broad allowedTools (asking for gm-only) rejected.
- [ ] Commit: `feat(tools): per-wake authority narrowing`.

### [SEQUENTIAL] Task D.5 — Wrap existing DM detour tools as catalog primitives

**Files:**
- Modify: `src/runtime/dm/detourTools.js` (export each tool with catalog metadata)
- Modify: `src/runtime/dm/detourContracts.js` (no-op if already aligned)

**Steps:**
- [ ] Each detour tool maps to a catalog entry with appropriate `authority` (most are gm-only).
- [ ] Existing `test/dm-detour-tools.test.js` must still pass.
- [ ] Commit: `refactor(dm): wrap detour tools as tool-catalog primitives`.

### Task D.6 — Open PR-D

- [ ] Branch `pr/d-tool-bundles`.
- [ ] PR title: `feat(tools): tool catalog + per-wake narrowing + write-path enforcement (closes #18)`.

---

# PR #14 — Tool bundles + per-story events + pulse (PR-D + PR-E partial)

**Scope split note:** PR #14 covers the runtime substrate (tool catalog + per-wake narrowing + events.jsonl + pulse). PR #15 covers the indexer + live UI + image-generation talents. Splitting this way means PR #14 lands the data plane and PR #15 lands the user-visible payoff.

(PR #14 task detail = PR-D tasks below + EF.1, EF.2, EF.4, EF.5, EF.6, EF.7 from the original PR-E+F section. PR #15 task detail = EF.3, EF.8, EF.9 + new live-UI-and-image-gen tasks below.)

# PR #15 — Live UI wiring + image-generation talents (PR-F + payoff)

**Scope:** This is the payoff PR. Wires the Parley web UI to the actual Belayer + Hermes runtime so reactions appear live and NPC portraits + scene backgrounds get generated for real.

**Key design call (per user 2026-05-04):** image generation is NOT a custom Parley API call. It's modeled as additional Belayer talents (`background-artist`, `portrait-artist`) materialized into each crag, with `authority.tools` permitting whatever Hermes Nous-tool-gateway image-generation skills are installed. Wakes target these talents the same way story NPCs are waked; their output is a registered Belayer artifact (PNG file path + manifest entry); Parley reads the artifact and the UI displays it.

This keeps the Belayer/Parley boundary intact: Belayer owns the talent runtime + image-tool gateway, Parley owns story canon + visual asset metadata.

## PR #15 contract pins

- **Image talent profiles:** `background-artist` and `portrait-artist` materialized into every crag at instance creation (PR-A+B already plumbs this; PR #15 adds these as additional named talents in the materializer).
- **Talent metadata `.belayer-talent.yaml`:** `talent_name: background-artist` / `portrait-artist`; `memory_scope: crag` (so they accumulate world-style preferences); `authority.tools` lists the Hermes image-gen skills available through the Nous tool gateway.
- **Wake envelope for image gen:** `parley-image-wake/v1` (subtype of `parley-wake/v1` from PR #13). Carries scene/character ref, prompt seed (from existing `worlds/<w>/assets/manifest.json` + character `portrait_prompt`), output path, style anchors.
- **Image artifact:** Belayer registers the generated PNG as an artifact; Parley appends a `visual_asset_ready` event to the story's `events.jsonl`; UI receives via SSE and re-renders.
- **SSE transport:** `GET /events/:storyId` server-sent-event stream. UI auto-reconnects on disconnect. Each `events.jsonl` append fans out to subscribers.
- **No streaming text mid-turn (yet):** turn-level granularity. Streaming individual NPC tokens is a follow-up.

## PR #15 Tasks

### [SEQUENTIAL] Task UI.0 — Hermes image-tool gateway probe

**Files:**
- Create: `scripts/probe-hermes-image-tools.mjs`
- Create: `docs/plans/2026-05-04-belayer-profile-coupling-pr15-findings.md`

**Steps:**
- [ ] Inspect `~/.hermes/plugins/` and the Nous tool gateway plugin to enumerate which image-gen skills are actually installed. Document exact tool names.
- [ ] Probe one image-gen tool end-to-end via a minimal Hermes session (or via a `belayer climb start` with a single ephemeral talent loaded with that tool).
- [ ] Capture: tool name, input schema, output shape (file path? base64? URL?), latency, failure modes.
- [ ] Write findings doc; update PR #15 plan tasks below to use the actual tool names.
- [ ] Commit: `docs(plans): record PR #15 Hermes image-tool gateway probe findings`

### [SEQUENTIAL] Task UI.1 — Add `background-artist` + `portrait-artist` talents to materializer

**Files:**
- Modify: `src/runtime/instances/materializeInstance.js` — when materializing a crag, also create profile dirs + `.belayer-talent.yaml` for `background-artist` and `portrait-artist`. Both `memory_scope: crag`. `authority.tools` populated from probe findings.
- Modify: `worlds/<world-id>/WORLD.md` — declare which image style anchors to pass to art talents (per-world style overrides).
- Create: `test/instances/imageTalents.test.ts`

**Steps:**
- [ ] Add image talent definitions (id, role, lifecycle, authority.tools).
- [ ] Test: instance materialization produces both image-talent profiles correctly.
- [ ] Commit: `feat(instances): materialize background-artist and portrait-artist talents`

### [PARALLEL] Tasks UI.2 / UI.3 — Image wake envelope schemas

| Task | Schema | File |
|---|---|---|
| **UI.2** | `parley-image-wake/v1` | `src/contracts/parleyImageWake.ts` |
| **UI.3** | `parley-image-wake-result/v1` | `src/contracts/parleyImageWakeResult.ts` |

**Common steps:** schema, test (positive + 2 negative), commit.

### [SEQUENTIAL] Task UI.4 — Image-gen wake handler

**Files:**
- Create: `src/runtime/wake/imageWake.js`
- Create: `test/wake/imageWake.test.js`

**Steps:**
- [ ] Export `dispatchImageWake({ instanceDir, talentName, prompt, outputPath, styleAnchors, storyId })`. Reuses the wake-transport machinery from PR #13.
- [ ] On wake-result: validate, copy output PNG into `instances/<world>/<instance>/world/assets/<scene-or-character>.png`, append entry to `worlds/<w>/assets/manifest.json` (already an existing pipeline; integrate, don't re-invent).
- [ ] Append `visual_asset_ready` event to story's `events.jsonl`.
- [ ] Tests (mocked Belayer + filesystem): happy round-trip; daemon-down → `visual_asset_deferred` event.
- [ ] Commit: `feat(wake): image-generation wake handler with manifest integration`

### [SEQUENTIAL] Task UI.5 — SSE event stream endpoint

**Files:**
- Modify: `src/server.js` — add `GET /events/:storyId` SSE endpoint.
- Create: `src/runtime/events/sseBroadcaster.js`
- Create: `test/server/sseBroadcaster.test.js`

**Steps:**
- [ ] On every `events.jsonl` append (hook into existing `appendStoryEvent` from PR #14), fan out the new event to all SSE subscribers for that storyId.
- [ ] Heartbeat every 15s (`event: ping`).
- [ ] Disconnect cleanup.
- [ ] Tests: subscribe, append event, assert subscriber receives within 200ms; disconnect mid-stream cleans up subscriber list.
- [ ] Commit: `feat(server): SSE event stream per story instance`

### [PARALLEL] Tasks UI.6 / UI.7 — UI wiring

| Task | Concern | File |
|---|---|---|
| **UI.6** | Live event stream consumption | `src/client/app.js` (add EventSource + render-on-event) |
| **UI.7** | Visual asset rendering (background + portrait) | `src/client/app.js` + `src/client/styles.css` |

**Common steps per task:** edit UI, add manual smoke (browser-driven via existing scripts/), commit.

### [SEQUENTIAL] Task UI.8 — Indexer + promotion wrapper (folded from PR-E+F)

**Files:**
- Create: `src/runtime/indexer/indexer.js`
- Create: `src/runtime/indexer/promoteFromEval.js`
- Create: `scripts/parley-promote-from-eval.mjs`
- Create: tests for each.

(Detail unchanged from original EF.8 + EF.9 in the prior version of this plan.)

### Task UI.9 — Manual end-to-end demo

**Steps:**
- [ ] Start `belayer daemon`.
- [ ] `npm run instance:materialize -- --world last-lantern --as last-lantern-demo`
- [ ] `npm start`, browse to UI, play a turn.
- [ ] Observe: NPC reaction appears live (SSE), portraits + background generate (image talents), pulse panel reflects awake/dormant NPCs.
- [ ] Capture screenshots; commit demo notes to `docs/devlogs/2026-05-XX-belayer-profile-coupling-demo.md`.
- [ ] Commit: `docs(devlog): live demo of full Belayer profile coupling stack`

### Task UI.10 — Open PR #15

- [ ] Branch `feat/live-ui-wiring` (already established).
- [ ] PR title: `feat(ui): live event stream + image-generation talents (closes #19, #20)`.

---

# PR-E+F — Story-instance events + pulse + indexer boundary (LEGACY — superseded by PR #14 + PR #15 split above)

The original PR-E+F section is preserved below for reference but the work has been split: events + pulse + GM evaluation writer move into PR #14; indexer + promotion wrapper + live UI + image talents move into PR #15.

**Scope:** Per-story-instance `events.jsonl` (D8). Pulse read model. NPC-dormancy events with `talent-evaluation/v1` artifact references. GM `world-instance-evaluation/v1` writer. LLM-wiki indexer (read-only over committed artifacts + profile MEMORY). Promotion wrapper (`parley promote-from-eval`).

**Acceptance:** committed turns append to per-story `events.jsonl`; pulse regenerates from events; indexer answers "what does Mara privately believe?" by reading her profile MEMORY without giving any agent the ability to write canon as Markdown; `parley promote-from-eval` wraps `belayer promote`.

## PR-E+F Tasks

### [PARALLEL] Tasks EF.1 / EF.2 / EF.3 — Three independent schema files

| Task | Schema | File |
|---|---|---|
| **EF.1** | `parley-story-event/v1` | `src/contracts/storyEvent.ts` |
| **EF.2** | `parley-scene-pulse/v1` | `src/contracts/scenePulse.ts` |
| **EF.3** | `parley-world-instance-evaluation/v1` | `src/contracts/worldInstanceEvaluation.ts` |

**Common steps per task:** create schema, create test (round-trip + 2 negative), commit.

### [PARALLEL] Tasks EF.4 / EF.5 / EF.6 — Three independent runtime modules

Each task is independent in code, with shared input from EF.1-EF.3.

#### Task EF.4 — Per-story events.jsonl writer

**Files:**
- Create: `src/runtime/events/storyEventLog.js`
- Create: `test/events/storyEventLog.test.js`

**Steps:**
- [ ] Export `appendStoryEvent({ instanceDir, storyId, event })` that appends to `instances/<world>/<instance>/<storyId>/state/events.jsonl`.
- [ ] Validates event via `StoryEventSchema`.
- [ ] Tests: append-only (no rewrite); story isolation (Story A events don't show in Story B).
- [ ] Commit: `feat(events): per-story-instance events.jsonl writer`.

#### Task EF.5 — Pulse builder

**Files:**
- Create: `src/runtime/events/pulseBuilder.js`
- Create: `test/events/pulseBuilder.test.js`

**Steps:**
- [ ] Export `buildScenePulse({ instanceDir, storyId })` that reads `events.jsonl` + Belayer roster (which NPCs awake vs dormant via `belayer roster` shell-out) and writes `instances/<world>/<instance>/<storyId>/state/scene-pulse.json`.
- [ ] Pulse content: active tensions, visible consequences, current leads, NPC intentions, unresolved threads, awake-vs-dormant NPCs.
- [ ] Tests: regenerated from committed events; mock Belayer roster.
- [ ] Commit: `feat(events): scene-pulse read-model builder`.

#### Task EF.6 — npc.dormant event hook

**Files:**
- Create: `src/runtime/events/npcDormantHook.js`
- Create: `test/events/npcDormantHook.test.js`

**Steps:**
- [ ] Subscribe to Belayer `talent-evaluation` artifact registered events (or poll the artifact dir).
- [ ] Emit a `npc.dormant` event into the relevant story's `events.jsonl` with `evaluation_artifact_path`.
- [ ] Tests: mocked artifact appearance triggers correct event.
- [ ] Commit: `feat(events): npc.dormant hook from Belayer talent-evaluation`.

### [SEQUENTIAL] Task EF.7 — GM world-instance-evaluation writer

**Files:**
- Create: `src/runtime/events/worldInstanceEvaluationWriter.js`
- Create: `test/events/worldInstanceEvaluationWriter.test.js`

**Steps:**
- [ ] Export `writeWorldInstanceEvaluation({ instanceDir, storyId, summary })` writing to `instances/<world>/<instance>/<storyId>/world-instance-evaluation.json` (validates via `WorldInstanceEvaluationSchema`).
- [ ] Called at story end by GM (resident lifecycle, per D6).
- [ ] Tests: schema enforcement; idempotent rewrite.
- [ ] Commit: `feat(events): world-instance-evaluation writer (GM cross-story signal)`.

### [PARALLEL] Tasks EF.8 / EF.9 — Indexer boundary + promotion wrapper

#### Task EF.8 — LLM-wiki indexer (read-only)

**Files:**
- Create: `src/runtime/indexer/indexer.js`
- Create: `test/indexer/indexer.test.js`

**Steps:**
- [ ] Indexer reads: committed `events.jsonl` per story, `truth-verdicts.jsonl`, profile `MEMORY.md` (via Belayer SDK or shell-out).
- [ ] Exports query helpers: `getNpcPrivateBeliefs(characterId)`, `getPublicRumors(scope)`, `getPromotionCandidates(instanceId)`.
- [ ] **Hard contract: indexer never writes to canon.** Lint test asserts indexer module exports no write functions.
- [ ] Tests: query returns correct content; NPC private belief read works; canon-write attempt would be a missing function (compile-time guarantee via TypeScript later).
- [ ] Commit: `feat(indexer): read-only LLM-wiki indexer over committed artifacts + profile MEMORY`.

#### Task EF.9 — `parley promote-from-eval` wrapper

**Files:**
- Create: `scripts/parley-promote-from-eval.mjs`
- Modify: `package.json` (add `"promote": "node scripts/parley-promote-from-eval.mjs"`)
- Create: `test/indexer/promoteFromEval.test.js`

**Steps:**
- [ ] CLI args: `--eval <eval-artifact-path> --instance <instance-id>`.
- [ ] Reads eval artifact, identifies promotion candidates, invokes `belayer promote <eval>`, then writes the accepted facts into `worlds/<world-id>/lore/` or appropriate canon file.
- [ ] Tests: mocked Belayer + filesystem; promoted fact appears in world canon; rejected eval bails cleanly.
- [ ] Commit: `feat(indexer): parley promote-from-eval wrapper`.

### Task EF.10 — Open PR-E+F

- [ ] Branch `pr/ef-events-pulse-indexer`.
- [ ] PR title: `feat(events): story-instance events + pulse + indexer boundary (closes #19, #20)`.

---

## Subagent Dispatch Plan (parallelizable work)

The following task groups are genuinely independent and SHOULD be dispatched as parallel subagents:

| Wave | Parallel tasks | Why parallel |
|---|---|---|
| **PR #11 wave 1** | 11.1 + 11.2 | Toolchain scaffold and `common.ts` are independent |
| **PR #11 wave 2** | 11.3, 11.4, 11.5, 11.6, 11.7 | Five independent schema files, no shared imports beyond `common.ts` (already done) |
| **PR-A+B wave 1** | AB.4, AB.5 | Manifest writer and CLI are independent; both depend on AB.1-AB.3 |
| **PR-A+B wave 2** | AB.6.1, AB.6.2, AB.6.3 | Three world templates, independent files |
| **PR-C wave 1** | C.1, C.2, C.3 | Three independent envelope schemas |
| **PR-D wave 1** | D.2, D.3 | Two independent write-path handlers |
| **PR-E+F wave 1** | EF.1, EF.2, EF.3 | Three independent schema files |
| **PR-E+F wave 2** | EF.4, EF.5, EF.6 | Three independent runtime modules; all ingest the schemas from wave 1 |
| **PR-E+F wave 3** | EF.8, EF.9 | Indexer + promotion wrapper independent |

**Sequential gates** (cannot parallelize):
- PR boundaries (each PR opens after the prior PR merges)
- Within PR-A+B: AB.1 → AB.2 → AB.3 (schema before validators before writers); AB.7 → AB.8 (migration before runtime cutover); AB.9 (smoke runs after everything else)
- Within PR-C: C.4 → C.5 (handler before runtime hook)
- Within PR-D: D.1 → D.2/D.3 → D.4 → D.5 (catalog before writers before narrowing before detour wrap)
- Within PR-E+F: schemas before runtime modules before indexer

## NOT in scope (deferred — flag explicitly)

- Big-bang `.js → .ts` runtime migration (kept JS through all 5 PRs).
- Native Belayer Go SDK for Node callers (continue shelling out).
- MEMORY.md compaction at scale (deferred follow-up).
- Concurrent multi-player single-instance support.
- Belayer plugin packaging for tool catalog (ship as JSON manifest first).
- Promotion review/accept UI (only the CLI wrapper).
- Integration with Parley UI for pulse display (UI work is a follow-up after PR-E+F).
- LLM eval suite for NPC voice consistency.

## Verification target

The full stack is accepted when:

1. `npm test` passes after every PR (no regressions).
2. `npm run smoke:e2e` passes for all three scenarios (last-lantern, neon-afterhours, orchard-welcome) after PR-A+B.
3. `belayer doctor --crag <id>` reports clean for any materialized instance.
4. A `last-lantern-alpha` instance survives two `belayer climb` runs without losing Mara's MEMORY (after PR-A+B).
5. Wake round-trip with same `wake_id` is idempotent (after PR-C).
6. NPC attempt to call gm-only tool is rejected at narrowing time (after PR-D).
7. Pulse panel reflects committed events including dormancy state (after PR-E+F).
8. Indexer answers "what does Mara privately believe?" without offering any canon-write surface (after PR-E+F).
9. `parley promote-from-eval` round-trips a candidate from `talent-evaluation` to world canon (after PR-E+F).

## Outcomes & Retrospective

_Filled when each PR lands — see commit log for actual outcomes._
