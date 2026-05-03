# Instance Wiki Authoring Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Introduce the file-backed template/instance contract for Parley so gameplay agents only operate on materialized world/story instances, while templates remain deterministic seed material.

**Architecture:** Keep the current scenario/world runtime working. Add a stacked PR that locks the new source-of-truth contract in docs, schemas, and a small implementation plan. The next code PR can add the materializer and instance loaders without debating the model again.

**Tech Stack:** Node 20, vanilla file-backed runtime, Markdown/JSON/JSONL artifacts, no DB, no auth, no LLM/provider calls in setup.

---

## Outside Voice Inputs

This plan synthesizes two read-only agent reviews run against the current worktree:

- **Claude Code:** recommended a contract + scaffolding PR, with no `parleyRuntime.js` migration yet. It emphasized instance materialization, hard path guards, character context filtering, and promotion candidate files.
- **Codex:** recommended a contract-locking + thin implementation PR. It agreed that current `worlds/*` and `scenarios/*` should remain transitional template roots while the runtime keeps working.

Both agents converged on the same core decision: **do not let gameplay agents read templates. Materialize first, then bind gameplay to the instance.**

## Scope For This PR

This PR should be documentation/specification only, plus schema examples. It should not change runtime behavior yet.

In scope:

- define template vs instance terms;
- define instance storage layout;
- define source-of-truth hierarchy;
- define character non-omniscience contract;
- define story-log vs world-canon promotion policy;
- document exact future files/tests/smokes for the implementation PR;
- update existing docs so they no longer imply templates and runtime state are the same thing.

Out of scope:

- moving `worlds/*` to `templates/worlds/*`;
- moving `scenarios/*` to `templates/stories/*`;
- changing `src/runtime/parleyRuntime.js`;
- changing the server or UI;
- adding NPC agent infrastructure;
- adding DM approval UI;
- invoking any LLM during materialization;
- calling image providers or Belayer tools.

## Storage Contract

Current transitional template roots:

```text
worlds/<world-id>/                 # world template seed, plus legacy state during current prototype
scenarios/<scenario-id>/scenario.json # story template seed
```

Future instance root:

```text
instances/<world-instance-id>/
  instance.json
  world/
  stories/<story-instance-id>/
```

During play, the active instance is the artifact and source of truth.

## Implementation Plan For Next Code PR

### Task 1: Add deterministic instance materializer

**Objective:** Copy a world template and story template into a new instance directory without using agents or LLMs.

**Files:**

- Create: `src/runtime/instances/materialize.js`
- Create: `test/instances/materialize.test.js`
- Create: `scripts/init-parley-instance.mjs`

**Required behavior:**

- `materializeInstance({ worldTemplateDir, storyTemplatePath, instanceDir, instanceId, storyInstanceId })`
- Refuse to overwrite an existing instance.
- Write to a temp dir first, then rename into place.
- Copy selected world files into `instance/world/`.
- Convert `scenario.json` into `instance/stories/<storyInstanceId>/` seed files.
- Write `instance.json` with source template ids, versions, and hashes.
- Initialize empty state files.

**Tests:**

- materializes Last Lantern into temp `instances/<id>`;
- deleting source templates after materialization does not break instance reads;
- second materialization with same id fails;
- generated `instance.json` records source ids and hashes;
- no writes occur under source template dirs.

### Task 2: Add instance-only loaders with path guards

**Objective:** Make future runtime code consume instance paths through a narrow loader.

**Files:**

- Create: `src/runtime/instances/loadInstance.js`
- Create: `test/instances/load-isolation.test.js`

**Required behavior:**

- `loadWorldInstance(instanceDir)` reads only under `instanceDir/world`.
- `loadStoryInstance(instanceDir, storyInstanceId)` reads only under `instanceDir/stories/<id>`.
- Resolve every path and reject traversal outside `instanceDir`.
- Do not import or open `worlds/*` or `scenarios/*` after instance binding.

**Tests:**

- rejects `../worlds/last-lantern/WORLD.md`;
- succeeds when template roots are absent;
- returns paths rooted under the instance;
- hidden truth is not included in player/character context by default.

### Task 3: Add gameplay context builders

**Objective:** Provide scoped context for GM, validator, and characters.

**Files:**

- Create: `src/runtime/instances/gameplayContext.js`
- Create: `test/instances/gameplay-context.test.js`

**Required behavior:**

- `buildGmContext` can read active world/story instance context.
- `buildValidatorContext` includes speaker knowledge scopes and hidden-truth boundaries.
- `buildCharacterContext` filters by character knowledge, relationships, witnessed turns, and sharing guidance.
- Character context never includes templates, hidden truth, full story log, or pending promotion candidates.

**Tests:**

- Mara receives active scene and her own knowledge scope;
- Mara does not receive hidden truth;
- off-screen lore is excluded for `default_view: scene-local`;
- relationship/closeness guidance appears in character context;
- template paths do not appear in serialized context.

### Task 4: Add promotion candidate helpers

**Objective:** Separate story log from world-instance canon.

**Files:**

- Create: `src/runtime/instances/promotion.js`
- Create: `test/instances/promotion.test.js`
- Create: `scripts/accept-promotion-candidate.mjs`

**Required behavior:**

- Append pending candidates to story instance state.
- Accepting a candidate writes to world-instance canon and audit logs.
- Rejecting/defering does not change world canon.
- Promotion never rewrites `turns.jsonl`.
- Acceptance requires evidence turn ids and verdict ids.

**Tests:**

- pending candidate leaves `world-state.json` untouched;
- accepted candidate updates `world/canon/facts.jsonl`, `world/state/world-state.json`, `world/log.md`, and `promotions.jsonl`;
- rejected candidate leaves canon untouched;
- re-accepting an accepted candidate is idempotent;
- `turns.jsonl` is byte-identical before and after promotion.

### Task 5: Wire an instance smoke without replacing the current demos

**Objective:** Prove the new instance path works without breaking current scenario demos.

**Files:**

- Create: `scripts/smoke-parley-instance.mjs`
- Modify: `package.json`

**Command:**

```bash
npm run smoke:instance
```

**Smoke assertions:**

- create temp instance from Last Lantern;
- load active instance metadata;
- prepare visual asset contracts under instance world assets, not template world assets;
- append a fake turn and verdict under story instance state;
- write one promotion candidate;
- accept it into world instance canon;
- assert templates are untouched.

### Task 6: Runtime migration PR after the smoke exists

**Objective:** Move `runPlayerTurn` from scenario/world template paths to instance paths.

**Files likely touched:**

- `src/runtime/parleyRuntime.js`
- `src/runtime/scenarioPacks.js`
- `src/runtime/visualAssets.js`
- `src/server.js`
- `src/client/app.js`
- existing runtime and visual asset tests

**Not part of this PR.** This deserves its own stacked PR because it changes live behavior and needs browser smoke coverage.

## Test Plan For This Docs PR

Because this PR is docs/specs/schema examples only:

```bash
npm test
npm run smoke:runtime
npm run smoke:e2e
npm run smoke:scenarios
git diff --check
```

Expected: all pass. No runtime code changed.

## Risks

1. **Docs drift if runtime remains scenario-centric too long.** Mitigation: mark scenario/world roots as transitional, not wrong.
2. **Overbuilding the materializer.** Mitigation: deterministic copy, no DB, no UI, no LLM.
3. **NPC context too narrow.** Mitigation: knowledge model includes relationships and sharing guidance, not only hard facts.
4. **NPC context too broad.** Mitigation: character context builder has explicit deny-list and tests.
5. **Canon promotion becomes hidden auto-write.** Mitigation: promotion candidates are not canon; human/DM acceptance is required.
6. **Visual assets mutate templates.** Mitigation: next PR must test asset manifests/prompts under instance world dirs.

## Anti-Goals

- No template writes during gameplay.
- No gameplay agent template reads.
- No auto-promotion into canon.
- No full CMS/editor yet.
- No auth/DB/deployment.
- No Belayer story concepts.
- No one-off demo script that only works for Last Lantern.

## Acceptance Criteria

This planning PR is complete when:

- new specs define template/instance, character knowledge privacy, and canon promotion;
- schema examples exist for instance, story instance, and promotion candidate artifacts;
- existing docs no longer claim `worlds/<id>/state` is the final long-term runtime shape;
- the future implementation plan names exact files and tests;
- current tests/smokes still pass;
- the PR targets `nightshift/visual-asset-pipeline-implementation` so it is stacked on PR #8.
