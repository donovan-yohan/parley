# Web UI Redesign — Part 1a Implementation Plan (Repo Migration)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development with parallel dispatch where marked [PARALLEL]. Steps use checkbox (`- [ ]`) syntax for tracking. Three review checkpoints (after Group A, after Group B, after Group C); not per-task.

**Goal:** Migrate scenarios/templates and worlds/state into the new instances/ + worlds/<id>/scenarios/ layout the spec requires, leaving 142 baseline tests green and adding instance-materialization coverage. Pure repo + runtime path refactor; no UI work.

**Architecture:** Two groups of file moves (mechanical) bracketing one runtime-path update (sequential, atomic). Setup tasks (world.json stubs) and verification tasks (new instance tests) parallelize cleanly around the atomic flip.

**Tech Stack:** Node 20+, `node --test`, ESM modules. No new dependencies. Working tree: `.worktrees/feat-web-ui-redesign`, branch `feat/web-ui-redesign`.

**Source spec:** `docs/specs/2026-05-04-web-ui-redesign-design.md` (sections: Information Architecture → Repository Layout, Migration, Test Plan — Part 1, Acceptance Criteria — Part 1, items 8–9).

**Decisions inherited:**
- Migrated instances use `playthrough-1` naming (D2 office-hours).
- 4-PR stacked execution; this plan covers PR #1 of 4 (D2 office-hours).
- Visual asset pipeline + `belayerCharacterAdapter` callers do **not** change in 1a (D2A eng-review).
- Test approach: 142 baseline preserved + new instance materialization tests (D3A eng-review).

---

## File Structure

**New (created):**
- `worlds/last-lantern/world.json` — stub manifest, parley-world/v1 minimum fields.
- `worlds/neon-afterhours/world.json` — same.
- `worlds/orchard-welcome/world.json` — same.
- `worlds/last-lantern/scenarios/last-lantern/scenario.json` — moved from top-level `scenarios/last-lantern/scenario.json`.
- `worlds/neon-afterhours/scenarios/neon-afterhours/scenario.json` — moved.
- `worlds/orchard-welcome/scenarios/orchard-welcome/scenario.json` — moved.
- `instances/last-lantern/playthrough-1/.gitkeep` — empty migrated instance directory.
- `instances/neon-afterhours/playthrough-1/.gitkeep` — same.
- `instances/orchard-welcome/playthrough-1/.gitkeep` — same.
- `test/instance-materialization.test.js` — new instance creation + idempotent re-run + missing-template tests.

**Modified:**
- `src/runtime/scenarioPacks.js:44` — replace single `stateDir` with `worldDir` + `instanceDir` + scan `worlds/<id>/scenarios/` for templates. No `world.json` reads land in 1a; the scenario.json `world` block stays authoritative through Part 1c, when the Zod schemas + theme cascade introduce world.json consumers.
- `src/runtime/parleyRuntime.js` — every callsite that accepts `stateDir` accepts `instanceDir` instead. Internal helpers (`nextTurnId`, `persistHiddenTruth`, `persistDmArtifacts`) take `instanceDir`.
- `src/runtime/truthAuthority.js:11,115-125` — `stateDir` parameter renamed to `instanceDir`; evidence path string updated.
- `test/support/inProcessServer.js` — fixture builders that construct `stateDir` paths use the new instance path.
- All test files using explicit `stateDir` overrides — sweep + replace.

**Removed (after move):**
- `scenarios/last-lantern/`, `scenarios/neon-afterhours/`, `scenarios/orchard-welcome/` — empty top-level directories deleted.
- `worlds/last-lantern/state/`, `worlds/neon-afterhours/state/`, `worlds/orchard-welcome/state/` — empty directories deleted (no content today; assets stay in `worlds/<id>/assets/`).

**Untouched (D2A enumeration):**
- `src/runtime/visualAssets.js` — assets live under `worlds/<id>/assets/`, unaffected by state move.
- `src/runtime/belayerCharacterAdapter.js` — `persistCharacterMarkdown` writes into `worldDir`, unaffected; cross-story memory is `belayer-profile-coupling`'s problem.
- `src/server.js:74-107` — `serveWorldAsset` reads `worldDir/assets/`, unaffected.

---

## Group A — Pre-Flip Setup (PARALLEL, no behavior change)

Three tasks dispatchable as parallel subagents. Each lands a `world.json` stub for one world. Stubs are pure additions; no runtime callers consume them in this PR. Validates that adding new manifests doesn't break baseline tests.

### Task A1: world.json stub — Last Lantern [PARALLEL]

**Files:**
- Create: `worlds/last-lantern/world.json`

- [ ] **Step 1: Write the manifest stub**

```json
{
  "schema_version": "parley-world/v1",
  "id": "last-lantern",
  "name": "Last Lantern",
  "premise": "A rain-soaked crossroads tavern where travelers trade rumors before the old roads.",
  "tone": "grounded fantasy mystery",
  "scenarios": ["last-lantern"]
}
```

- [ ] **Step 2: Verify baseline tests still pass**

Run: `npm test`
Expected: 142 tests pass, 0 fail.

### Task A2: world.json stub — Neon Afterhours [PARALLEL]

**Files:**
- Create: `worlds/neon-afterhours/world.json`

- [ ] **Step 1: Write the manifest stub**

```json
{
  "schema_version": "parley-world/v1",
  "id": "neon-afterhours",
  "name": "Neon Afterhours",
  "premise": "Corporate audit systems, exhausted handlers, and faction pressure collide after the office goes dark.",
  "tone": "tense cyberpunk procedural",
  "scenarios": ["neon-afterhours"]
}
```

- [ ] **Step 2: Verify baseline tests still pass**

Run: `npm test`
Expected: 142 tests pass.

### Task A3: world.json stub — Mossgrove [PARALLEL]

**Files:**
- Create: `worlds/orchard-welcome/world.json`

- [ ] **Step 1: Write the manifest stub**

```json
{
  "schema_version": "parley-world/v1",
  "id": "orchard-welcome",
  "name": "Mossgrove",
  "premise": "Neighbors share work, food, and careful silences around an orchard tradition.",
  "tone": "warm cozy small-town mystery",
  "scenarios": ["orchard-welcome"]
}
```

- [ ] **Step 2: Verify baseline tests still pass**

Run: `npm test`
Expected: 142 tests pass.

---

## ✋ Review Checkpoint 1 (after Group A)

Three world.json files added. No runtime caller reads them yet (that lands in 1c with Zod schemas). All 142 baseline tests pass.

Single commit for the group:

```bash
git add worlds/last-lantern/world.json worlds/neon-afterhours/world.json worlds/orchard-welcome/world.json
git commit -m "feat(1a): add world.json manifest stubs for the three existing worlds

Stub fields per parley-world/v1 minimum (id, name, premise, tone, scenarios).
No runtime caller reads world.json until Part 1c lands the Zod schemas.

Refs: docs/specs/2026-05-04-web-ui-redesign-design.md (Part 1a)"
```

User reviews. If approved, proceed to Group B.

---

## Group B — The Atomic Flip (SEQUENTIAL, single commit)

Six tasks executed in order in a single subagent dispatch. The runtime updates and the file moves must land together; either nothing changes or everything does. Tests stay green at the end.

### Task B1: Update `src/runtime/scenarioPacks.js` to emit `instanceDir`

**Files:**
- Modify: `src/runtime/scenarioPacks.js:44`

- [ ] **Step 1: Replace stateDir + add instanceDir + scan new scenario location**

Find the `loadScenarioPack` return object near line 44. Current shape:
```js
return {
  ...scenario,
  scenarioPath,
  stateDir: path.join(repoRoot, "worlds", worldId, "state"),
  worldDir: path.join(repoRoot, "worlds", worldId)
};
```

Replace with:
```js
return {
  ...scenario,
  scenarioPath,
  worldDir: path.join(repoRoot, "worlds", worldId),
  instanceDir: path.join(repoRoot, "instances", worldId, "playthrough-1")
};
```

Also update the scenario discovery path. Find any reference to `path.join(scenariosDir, id, "scenario.json")` and replace with the new layout:
```js
const scenarioPath = path.join(repoRoot, "worlds", worldId, "scenarios", id, "scenario.json");
```

The top-level `scenariosDir` constant becomes obsolete — remove it.

The `id` to `worldId` mapping today is 1:1 (each scenario id == its world id). Encode that explicitly:
```js
const worldId = id; // 1a invariant; future PRs may decouple
```

- [ ] **Step 2: Add `ensureInstanceDir(instanceDir)` helper**

```js
import { mkdir } from "node:fs/promises";

async function ensureInstanceDir(instanceDir) {
  await mkdir(instanceDir, { recursive: true });
}
```

Export it. Call sites (parleyRuntime + tests) will invoke it before any write.

### Task B2: Update `src/runtime/parleyRuntime.js` callsites

**Files:**
- Modify: `src/runtime/parleyRuntime.js` (lines 25, 38, 80, 120, 122, 145, 150, 247, 248, 378, 383, 394, 404)

- [ ] **Step 1: Rename parameter `stateDir` to `instanceDir` everywhere**

Mechanical rename. Every function that accepts `stateDir` accepts `instanceDir`. Every reference updates. Watch for the resolution pattern:
```js
const resolvedStateDir = stateDir ?? scenario.stateDir;
```
becomes:
```js
const resolvedInstanceDir = instanceDir ?? scenario.instanceDir;
```

Internal helpers (`nextTurnId`, `persistHiddenTruth`, `persistDmArtifacts`) take `instanceDir`.

- [ ] **Step 2: Call `ensureInstanceDir` before the first write each turn**

In `runPlayerTurn` (around line 80), before any `appendJsonLine`/`writeFile` call against the instance dir, invoke:
```js
await ensureInstanceDir(resolvedInstanceDir);
```

This makes `instances/<world-id>/playthrough-1/` a self-materializing directory rather than something the migration must pre-create.

### Task B3: Update `src/runtime/truthAuthority.js` evidence paths

**Files:**
- Modify: `src/runtime/truthAuthority.js:11,103,115-125`

- [ ] **Step 1: Rename parameter and evidence path**

`judgeTurn` parameter list: `stateDir` → `instanceDir`. Forwarded into `buildEvidencePaths` as `instanceDir`.

`buildEvidencePaths` signature becomes `({ scenario, instanceDir, worldDir })`. Body:
```js
function buildEvidencePaths({ scenario, instanceDir, worldDir }) {
  const evidence = [];
  if (scenario?.scenarioPath) {
    evidence.push(scenario.scenarioPath);
  }
  if (instanceDir) {
    evidence.push(`${instanceDir}/turns.jsonl`);
  } else if (worldDir && scenario?.world?.id) {
    evidence.push(`instances/${scenario.world.id}/playthrough-1/turns.jsonl`);
  } else if (scenario?.world?.id) {
    evidence.push(`instances/${scenario.world.id}/playthrough-1/turns.jsonl`);
  }
  return evidence;
}
```

The `worlds/<id>/state/turns.jsonl` fallback string is gone.

### Task B4: Update `test/support/inProcessServer.js` and test fixtures

**Files:**
- Modify: `test/support/inProcessServer.js`
- Modify: every test file that passes a `stateDir` override

- [ ] **Step 1: Sweep test fixture builders**

Run `grep -RIn "stateDir" test/`. For every match, replace with `instanceDir`. Fixture path strings that read `worlds/<id>/state/...` become `instances/<id>/playthrough-1/...`.

- [ ] **Step 2: Update fixture creation helpers to call `ensureInstanceDir`**

Wherever a test fixture creates a temp directory and passes it as `stateDir`, the same temp directory now passes as `instanceDir`. The runtime calls `ensureInstanceDir` itself, so test setup doesn't need changes there.

### Task B5: Move scenarios + state on disk

**Files:**
- Move: `scenarios/last-lantern/scenario.json` → `worlds/last-lantern/scenarios/last-lantern/scenario.json`
- Move: `scenarios/neon-afterhours/scenario.json` → `worlds/neon-afterhours/scenarios/neon-afterhours/scenario.json`
- Move: `scenarios/orchard-welcome/scenario.json` → `worlds/orchard-welcome/scenarios/orchard-welcome/scenario.json`
- Create: `instances/last-lantern/playthrough-1/.gitkeep`, `instances/neon-afterhours/playthrough-1/.gitkeep`, `instances/orchard-welcome/playthrough-1/.gitkeep`
- Remove: `worlds/last-lantern/state/`, `worlds/neon-afterhours/state/`, `worlds/orchard-welcome/state/` (all empty today)
- Remove: `scenarios/` top-level directory (now empty)

- [ ] **Step 1: Move scenarios via git mv**

```bash
mkdir -p worlds/last-lantern/scenarios/last-lantern
git mv scenarios/last-lantern/scenario.json worlds/last-lantern/scenarios/last-lantern/scenario.json

mkdir -p worlds/neon-afterhours/scenarios/neon-afterhours
git mv scenarios/neon-afterhours/scenario.json worlds/neon-afterhours/scenarios/neon-afterhours/scenario.json

mkdir -p worlds/orchard-welcome/scenarios/orchard-welcome
git mv scenarios/orchard-welcome/scenario.json worlds/orchard-welcome/scenarios/orchard-welcome/scenario.json

rmdir scenarios/last-lantern scenarios/neon-afterhours scenarios/orchard-welcome scenarios
```

- [ ] **Step 2: Create instance directories with .gitkeep**

```bash
mkdir -p instances/last-lantern/playthrough-1
mkdir -p instances/neon-afterhours/playthrough-1
mkdir -p instances/orchard-welcome/playthrough-1
touch instances/last-lantern/playthrough-1/.gitkeep
touch instances/neon-afterhours/playthrough-1/.gitkeep
touch instances/orchard-welcome/playthrough-1/.gitkeep
```

- [ ] **Step 3: Remove empty `worlds/<id>/state/` directories**

```bash
rmdir worlds/last-lantern/state worlds/neon-afterhours/state worlds/orchard-welcome/state
```

If `rmdir` fails because the directory has untracked content, investigate before forcing — there should be nothing in any of these today. (`git status` confirms.)

### Task B6: Run full test suite

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: 142 tests pass, 0 fail. Any failure here is a missed `stateDir` callsite — fix before continuing.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Run runtime smoke**

Run: `npm run smoke:runtime`
Expected: smoke completes; new turn writes land under `instances/last-lantern/playthrough-1/`.

Verify with: `ls instances/last-lantern/playthrough-1/` — should show `turns.jsonl`, `world-state.json`, etc.

---

## ✋ Review Checkpoint 2 (after Group B)

The atomic flip lands as a single commit:

```bash
git add src/runtime/scenarioPacks.js src/runtime/parleyRuntime.js src/runtime/truthAuthority.js test/
git add worlds/last-lantern/scenarios worlds/neon-afterhours/scenarios worlds/orchard-welcome/scenarios
git add instances/
git add -u  # picks up the deleted scenarios/ dir + worlds/*/state/ dirs
git status  # human review before commit
git commit -m "refactor(1a): migrate to instances/ layout and worlds/<id>/scenarios/

Replaces stateDir parameter throughout the runtime with instanceDir, pointing
at instances/<world-id>/playthrough-1/. Scenarios move from top-level scenarios/
to worlds/<world-id>/scenarios/<scenario-id>/scenario.json. Instance directories
are self-materializing via ensureInstanceDir; the .gitkeep files preserve the
shape pre-first-run.

Runtime callers updated:
- src/runtime/scenarioPacks.js (emits instanceDir + worldDir, scans new path)
- src/runtime/parleyRuntime.js (every stateDir parameter and helper)
- src/runtime/truthAuthority.js (evidence path strings, parameter)
- test/support/inProcessServer.js + every test passing a stateDir override

Untouched per spec D2A:
- src/runtime/visualAssets.js (assets stay under worlds/<id>/assets/)
- src/runtime/belayerCharacterAdapter.js (worldDir writes only)
- src/server.js serveWorldAsset (worlds/<id>/assets/ unchanged)

All 142 baseline tests pass. Refs: docs/plans/2026-05-04-web-ui-redesign-part-1a-migration.md"
```

User reviews. If approved, proceed to Group C.

---

## Group C — Post-Flip Verification (PARALLEL)

Three tasks dispatchable as parallel subagents. Each adds new test coverage or verifies a specific migration property.

### Task C1: New test — instance materialization [PARALLEL]

**Files:**
- Create: `test/instance-materialization.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadScenarioPack } from "../../src/runtime/scenarioPacks.js";
import { runPlayerTurn } from "../../src/runtime/parleyRuntime.js";

test("loadScenarioPack emits instanceDir under instances/<world-id>/playthrough-1", async () => {
  const scenario = await loadScenarioPack("last-lantern");
  assert.match(scenario.instanceDir, /instances\/last-lantern\/playthrough-1$/);
  assert.match(scenario.worldDir, /worlds\/last-lantern$/);
  assert.equal(scenario.stateDir, undefined, "stateDir is no longer emitted");
});

test("loadScenarioPack reads scenario.json from worlds/<id>/scenarios/<scenario-id>/", async () => {
  const scenario = await loadScenarioPack("neon-afterhours");
  assert.match(scenario.scenarioPath, /worlds\/neon-afterhours\/scenarios\/neon-afterhours\/scenario\.json$/);
});

test("instance directory materializes on first turn (idempotent)", async () => {
  const tmpInstance = await mkdtemp(path.join(tmpdir(), "parley-instance-"));
  try {
    const scenario = await loadScenarioPack("last-lantern");
    await runPlayerTurn({
      scenarioId: "last-lantern",
      playerAction: "I ask who remembers the old north road.",
      instanceDir: tmpInstance
    });
    const turnsStat = await stat(path.join(tmpInstance, "turns.jsonl"));
    assert.ok(turnsStat.isFile(), "turns.jsonl was written under the instance dir");

    // Idempotent — running again does not throw or duplicate
    await runPlayerTurn({
      scenarioId: "last-lantern",
      playerAction: "I ask who remembers the old north road.",
      instanceDir: tmpInstance
    });
  } finally {
    await rm(tmpInstance, { recursive: true, force: true });
  }
});

test("missing scenario.json under worlds/<id>/scenarios/ fails clearly", async () => {
  await assert.rejects(
    () => loadScenarioPack("nonexistent-world"),
    (err) => err.message.includes("nonexistent-world") || err.code === "ENOENT"
  );
});
```

- [ ] **Step 2: Run the new test file**

Run: `node --test test/instance-materialization.test.js`
Expected: 4 tests pass.

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: 146 tests pass (142 baseline + 4 new).

### Task C2: Verify runtime smoke writes to instances/ [PARALLEL]

**Files:**
- Read-only verification; no file changes.

- [ ] **Step 1: Clear any prior smoke artifacts**

```bash
rm -rf instances/last-lantern/playthrough-1/turns.jsonl
rm -rf instances/last-lantern/playthrough-1/world-state.json
rm -rf instances/last-lantern/playthrough-1/hidden-truth.jsonl
ls instances/last-lantern/playthrough-1/
```

Expected: only `.gitkeep` remains.

- [ ] **Step 2: Run runtime smoke**

Run: `npm run smoke:runtime`
Expected: smoke passes; new artifacts appear under `instances/last-lantern/playthrough-1/`.

- [ ] **Step 3: Verify legacy state path is empty**

```bash
ls worlds/last-lantern/state 2>&1
```

Expected: `No such file or directory` — proves nothing fell through to the old path.

- [ ] **Step 4: Reset for next runs**

```bash
rm -rf instances/last-lantern/playthrough-1/turns.jsonl
rm -rf instances/last-lantern/playthrough-1/world-state.json
rm -rf instances/last-lantern/playthrough-1/hidden-truth.jsonl
```

### Task C3: Verify scenarios smoke + e2e [PARALLEL]

**Files:**
- Read-only verification.

- [ ] **Step 1: Run scenarios smoke**

Run: `npm run smoke:scenarios`
Expected: passes against the new layout; all three scenarios load from their `worlds/<id>/scenarios/<id>/scenario.json` paths.

- [ ] **Step 2: Run e2e smoke**

Run: `npm run smoke:e2e`
Expected: passes; verifies `/api/turn` end-to-end through the new instance directory.

If any smoke fails, the migration missed a callsite — re-run Group B's grep + sweep.

---

## ✋ Review Checkpoint 3 (after Group C)

New tests + verification land as a single commit:

```bash
git add test/instance-materialization.test.js
git commit -m "test(1a): instance materialization coverage

- loadScenarioPack emits instanceDir + worldDir, no stateDir
- scenarioPath resolves under worlds/<id>/scenarios/<id>/
- runPlayerTurn materializes the instance directory and is idempotent
- missing-world failure is clear

Brings total test count to 146.

Refs: docs/plans/2026-05-04-web-ui-redesign-part-1a-migration.md"
```

User reviews. If approved, Part 1a is done — open the PR against `main`.

---

## Out of scope for this plan (1a)

Each item below is explicitly deferred to a later PR. Tagged with the future PR that owns it:

- World JSON Zod schema validation (parley-world/v1) → **1c** (lands with the theme cascade work).
- Reading `world.json` to populate L1 tile metadata → **1d** (lands with the L1 page).
- `instances/` `.gitignore` policy decision (currently tracked) → revisit when first non-test instance write lands in main.
- Multi-instance support beyond `playthrough-1` (auto-numbering, switcher) → **1d** (with L2 instance switcher UX).
- Story instance subdirectory (`instances/<world-id>/<instance-id>/stories/`) → **1d** (with L3).
- `theme.yaml` files → **1c**.
- Removing the scenario dropdown from the demo UI → **1d** (entire demo cleanup happens together).
- Typed `AgentTurnAuthor` seam → **1b**.

## Parallelization summary

```
Group A  ┐
  A1 [P] ┤
  A2 [P] ┼──→  Checkpoint 1 (commit)
  A3 [P] ┘

Group B (sequential, atomic):
  B1 → B2 → B3 → B4 → B5 → B6  ──→  Checkpoint 2 (commit)

Group C  ┐
  C1 [P] ┤
  C2 [P] ┼──→  Checkpoint 3 (commit)  ──→  PR
  C3 [P] ┘
```

3 checkpoints. 3 commits. 6 parallel subagent dispatches (3 in A, 3 in C). 1 sequential subagent dispatch (B). Each parallel group is independent enough to run in parallel without merge conflicts (each subagent touches its own world dir or its own test file).
