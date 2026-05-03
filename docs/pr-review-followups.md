# PR Review Followups (PRs #1–#10)

Captured 2026-05-03 before merging the stacked PRs into `main`.

Sources:
- GitHub review threads (gemini-code-assist + copilot-pull-request-reviewer)
- PR review bodies and any unresolved inline comments

Status legend:
- **OUTDATED** — code/file changed since comment (likely already addressed by a follow-up commit on that PR)
- **OPEN** — comment still references current code state and was never marked resolved
- **NOTED** — already acknowledged via a "Codex addressed feedback" commit on the originating PR; verify after merge to `main`

Address remaining **OPEN** items in the cleanup PR after the stack lands. Spot-check **NOTED**/**OUTDATED** items only if subsequent commits did not actually fix them.

---

## PR #1 — Last Lantern belayer smoke test
Branch: `demo/last-lantern-belayer-generated-talent` → `main`
Status: All review feedback **NOTED** in `fix: address PR #1 review feedback` (per Codex summary on PR).

Spot-check after merge:
- `scripts/smoke-last-lantern.sh` — temp `BELAYER_HOME` default, portable `mktemp`, regex-tolerant matching, explicit error messages on missing artifacts, CLI-based inspection (no internal Belayer file paths).
- `examples/last-lantern/README.md` — wording matches actual smoke-script behavior re: temp home vs. opt-in `SMOKE_BELAYER_HOME`.

---

## PR #2 — Parley nightshift MVP docs
Branch: `nightshift/twine-mvp` → (was PR #1, will retarget to `main`)
Status: All review feedback **NOTED** in `fix: address PR #2 review feedback`.

Spot-check after merge:
- `AGENTS.md` — confirms nightshift addendum spec listed in Relevant Files.
- `docs/specs/2026-05-01-nightshift-addendum-stacked-prs-ui-prose.md` — `SillyTavern` capitalization.
- `examples/last-lantern/artifacts/world-state.json` — schema namespace `parley-world-state/v1`.

---

## PR #3 — Parley world contracts
Branch: `nightshift/claude-world-contracts`
Status: All review feedback **NOTED** in `fix: address PR #3 review feedback`.

Spot-check after merge:
- `docs/specs/parley-character-contract.md` — provenance dedup; explicit "absent OR empty `tags` block both violate contract" wording around line 147.
- `docs/specs/parley-truth-authority-contract.md` — `Verdict Shape` example includes `hidden_truth_writes`.
- `docs/specs/parley-world-bible-shape.md` — `state/world-state.json.open_threads` typo fixed (just the file path, no JSON property suffix).

---

## PR #4 — Last Lantern web runtime slice
Branch: `nightshift/codex-ui-runtime`
Status: review feedback **NOTED** in `fix: address PR #4 review feedback` (1 MB body cap, YAML scalar comment/quote stripping, transcript append vs. replace).

OPEN — verify the fix on `main`:
1. **`src/server.js:83` — request body size cap (`readJsonBody`)** *(security-high, gemini)*
   - Confirm the 1 MB cap returns HTTP 413 and the test added in the followup commit covers oversized payloads.
2. **`src/runtime/parleyRuntime.js:172` — `matchYamlScalar` regex** *(gemini)*
   - Confirm comment stripping and single/double quote unwrapping work for `id: "my-id"` and `id: my-id # comment`.
3. **`src/client/app.js` — transcript render** *(gemini, OUTDATED)*
   - Verify only new turn entries are appended; full DOM replace via `replaceChildren` no longer fires per turn.

---

## PR #5 — Themed story UI + narrative e2e smoke
Branch: `nightshift/stack-audit-ui-prose-research`
Status: most inline UI comments **OUTDATED** after follow-up; several **OPEN** smoke/contract gaps remain.

OPEN — must address:
1. **`scripts/smoke-parley-e2e.mjs` — bypasses HTTP path** *(copilot)*
   - Smoke calls `runPlayerTurn` directly; never exercises `/api/turn`, static asset serving, or client DOM. UI regressions stay green.
   - Action: add a smoke variant that boots the server and drives a real HTTP turn (and ideally one DOM-level assertion via headless or a Node-side fetch + HTML snapshot).
2. **`scripts/smoke-parley-e2e.mjs` — Ashford lead invariant too loose** *(copilot)*
   - Existing checks only assert "some lead exists" and "some unresolved exists." Doesn't prove Ashford stays a lead vs. being promoted to canon.
   - Action: assert the specific lead id (`lead-ashford-…`) appears in `truthVerdict.lead_writes` and that no canonical fact about Ashford is added.
3. **`test/parley-runtime.test.js:47` — JSONL artifact assertion too loose** *(copilot)*
   - Substring-matches `lead`; passes even on wrong category/id.
   - Action: parse the JSONL and assert on the exact lead id and category field.
4. **`src/runtime/truthAuthority.js:15` — `lead` bucket added without spec update** *(copilot)*
   - The `parley-truth-verdict/v1` schema/examples in `docs/schemas/` only define `canon`, `character_belief`, `rumor`, `unresolved`, `hidden_truth`. Adding `lead` here forks the contract.
   - Action: either update the schema + example for v1, or bump to v1.1 and version-gate.
5. **`docs/research/2026-05-02-stack-audit.md:22` — leaks workstation path** *(copilot)*
   - Replace absolute contributor path with a relative reference or remove it.

NOTED — UI cleanups (per Codex addressed-feedback commit, but quick verify):
- `src/client/app.js` — Mara-specific hardcoded notes/status strings now scenario/character-driven.
- `src/client/app.js` — failed turn no longer clears `latestResult`; sidebar persists last good state on server error.
- `src/client/app.js` — `character.tags` access uses optional chaining + filter-out empty fallbacks for role/faction/tone interpolation.

---

## PR #6 — Runnable scenario packs
Branch: `nightshift/scenario-packs-demo`
Status: largely **OPEN** — no follow-up commit on this PR.

OPEN — must address:
1. **`src/runtime/scenarioPacks.js:16` — `listScenarioPacks` fragility** *(gemini)*
   - `Promise.all` over every entry in `scenarios/` rejects the whole listing if any directory lacks `scenario.json` (e.g. `.DS_Store`, scratch dirs).
   - Action: settle individually, skip non-pack entries with a logged warning.
2. **`src/runtime/scenarioPacks.js:34` — `loadScenarioPack` path traversal via `world.id`** *(copilot, security)*
   - `scenario.world.id` is interpolated into `stateDir`/`worldDir` without validation; `../...` could escape `worlds/`.
   - Action: validate against `^[a-z0-9][a-z0-9-]*$` (or equivalent) before use.
3. **`src/runtime/scenarioPacks.js:96` — `validateScenarioPack` shallow check** *(copilot)*
   - Only checks top-level keys; nested `scenario.world.id`, `character.id/name/role`, `response.id/narration/matchAny` are unchecked.
   - Action: extend validator to walk required nested fields.
4. **`src/runtime/parleyRuntime.js:242` — naming inconsistency** *(gemini)*
   - `buildScenarioCharacter` returns `belayerGeneratedTalent` (camelCase) but `buildWorldState` writes `belayer_generated_talent` (snake_case).
   - Action: pick one (camelCase is consistent with rest of code), rip out defensive both-name reads.
5. **`src/client/app.js:270` — defensive both-name read** *(gemini, follow-on of #4)*
   - After #4, simplify to single key access.
6. **`src/runtime/truthAuthority.js:61` — `evidence` paths leak repo paths under temp dirs** *(copilot)*
   - Verdict evidence derived from `scenario.scenarioPath` + `scenario.world.id`, but `runPlayerTurn` can override `stateDir`/`worldDir` (smoke + tests).
   - Action: build evidence paths from the active `stateDir`/`worldDir`, not the original scenario locations.
7. **`src/runtime/belayerCharacterAdapter.js:108` — `undefined` interpolation in markdown** *(copilot, OUTDATED but verify)*
   - `persistCharacterMarkdown` interpolates `metadata.knowledge_boundary`; missing `knowledgeBoundary` produces literal `"undefined"`.
   - Action: validate at scenario load OR omit the field when absent.

---

## PR #7 — Strict/loose runtime split
Branch: `nightshift/strict-loose-runtime-split`
Status: **OPEN** across the board — significant contract gaps.

OPEN — must address:
1. **`src/runtime/truthAuthority.js:68` — every accepted turn requires a canon fact** *(copilot)*
   - Undercuts the loose-authoring seam: a turn that only emits beliefs/rumors/leads/unresolved gets revised away even though the new spec says it shouldn't.
   - Action: relax the validator so turns with no canon writes can still pass when other categories are present.
2. **`src/runtime/parleyRuntime.js:66` — `author_only_hidden_truth` dropped** *(copilot)*
   - A contract-compliant authority can return hidden truths but nothing writes them to the `hidden-truth.jsonl` sidecar.
   - Action: persist hidden truth writes to the sidecar in the commit path.
3. **`src/runtime/parleyRuntime.js:245` — `verdict: "fail"` not accepted** *(copilot)*
   - Validator only accepts `pass`/`revise`; contract allows `fail`. Returns throw instead of clean halt.
   - Action: handle `fail` as a halting verdict (likely a no-commit state with diagnostics surfaced to the client).
4. **`src/runtime/parleyRuntime.js:249` — verdict `id` not validated** *(copilot)*
   - A `pass` with no `id` is accepted, then `truth_verdict: undefined` is persisted into `turns.jsonl` and `world-state.json`.
   - Action: require `id` on accepted verdicts.
5. **`src/runtime/parleyRuntime.js:222` — `turnAuthor` null check** *(gemini)*
   - `typeof null === "object"`, so explicit `null` falls through; `resolvedTurnAuthor` stays unset.
   - Action: add explicit `null` guard.
6. **`src/runtime/turnAuthor.js:24` — `responseId` default makes empty-check unreachable** *(gemini)*
   - Default `"unscoped-turn"` defeats the empty-id check immediately below.
   - Action: drop the default OR remove the empty check (pick one based on intent).
7. **`src/runtime/truthAuthority.js:103` — `normalizeFactText` whitespace-only** *(gemini)*
   - For LLM-authored turns, exact case+punctuation matching is brittle.
   - Action: lowercase + strip trailing punctuation (or document why exact match is intentional).

---

## PR #8 — Visual asset pipeline
Branch: `nightshift/visual-asset-pipeline-implementation`
Status: mix of **OPEN** structural issues + **OUTDATED** prompt-hash items addressed in `fix: address visual asset review feedback`.

OPEN — must address:
1. **`src/runtime/visualAssets.js:149` — backgrounds ignore `worlds/*/lore/locations/*.md`** *(copilot)*
   - Runtime builds backgrounds from `scenario.scene` only; new durable location records have no effect on art.
   - Action: read location records when present, fall back to `scenario.scene` only as a default.
2. **`src/runtime/visualAssets.js` — `portrait.status` from scenario ignored** *(copilot, currently OUTDATED but verify)*
   - A character marked `deferred` falls through to `prompt_ready` whenever the image is absent (e.g. `kestrel-9` in `neon-afterhours`).
   - Action: respect explicit `deferred` status; only auto-assign `prompt_ready` when status is unset.
3. **`scenarios/orchard-welcome/scenario.json` — visual `time_of_day` mismatch** *(copilot, OUTDATED but verify)*
   - Visual metadata says `morning`; prompt-driving `time_of_day` says `late golden afternoon`.
   - Action: pick one and align.
4. **`src/client/app.js` — picks first background asset** *(copilot, OUTDATED but verify)*
   - Should resolve background by `view.scene.id` from the manifest, not index 0; otherwise multi-location worlds render the wrong saved/pending background.
5. **`src/client/app.js:251` — unknown asset status falls through to `"missing"`** *(copilot)*
   - Loses the `deferred` distinction in the UI.
   - Action: pass through the raw status; only collapse to `missing` when truly unknown.

NOTED (per Codex follow-up):
- `prompt_hash` only preserved when the prompt file actually exists on disk (portraits + backgrounds).
- Character visual profile markdown filters out non-primitive values to avoid `[object Object]`.

---

## PR #9 — Instance wiki authoring contract (docs-only)
Branch: `nightshift/instance-wiki-authoring-plan`
Status: docs-only PR; all items **OPEN** in the spec/plan files.

OPEN — must address (in the cleanup PR or as a docs-fix follow-up before any implementation lands):
1. **`docs/plans/2026-05-03-instance-wiki-authoring.md:140` — `default_view: scene-local` undefined** *(copilot)*
   - Action: define where the field lives (character record vs. scene vs. loader option) before the implementation PR ships.
2. **`docs/plans/2026-05-03-instance-wiki-authoring.md:158` — typo `defering` → `deferring`** *(copilot)*
3. **`docs/plans/2026-05-03-instance-wiki-authoring.md:160` — promotion atomicity** *(gemini)*
   - Multi-file update (`facts.jsonl`, `world-state.json`, `log.md`, `promotions.jsonl`) without atomicity guidance.
   - Action: document the write order + recovery semantics (or specify a journal/2PC pattern).
4. **`docs/specs/parley-canon-promotion-policy.md:38` and `:101` — instance id mismatch** *(copilot)*
   - Example uses `kyle-last-lantern`; the new instance contract examples use `kyle-last-lantern-first-rumor`.
   - Action: pick one canonical id and update both examples + CLI snippet.
5. **`docs/specs/parley-canon-promotion-policy.md:54` and `docs/schemas/parley-promotion-candidate.v1.example.json:14` — id collision with existing examples** *(copilot)*
   - `turn-0003` + `claim_ids: ["c2"]` already refers to north-stones rumor in `parley-turn.v1.example.json`; corresponding verdict is `verdict-0002`, not `verdict-0003`.
   - Action: pick distinct ids that don't collide with existing example corpus.
6. **`docs/specs/parley-canon-promotion-policy.md:115` — `target` field validation** *(gemini)*
   - `proposed_writes.target` should be validated against an allowlist that excludes `turns.jsonl` to keep it byte-identical (per step 7).
7. **`docs/specs/parley-character-knowledge-privacy.md:60` — `may_read` selector grammar undefined** *(copilot)*
   - Selectors like `public_canon:location:last-lantern-tavern` have no defined grammar.
   - Action: add an EBNF (or at minimum a worked-example table) defining the selector format.

---

## PR #10 — DM detour scene tools
Branch: `nightshift/dm-detour-scene-tools`
Status: all **OPEN** — no follow-up commit on this PR.

OPEN — must address:
1. **`src/runtime/truthAuthority.js:88` — yes-and lets `handled` rejections pass** *(gemini, security-high)*
   - Significant contract shift: turns with rejected canon claims now pass if marked `handled`.
   - Action: confirm this is intentional design (it implements the detour spec) AND update `parley-truth-verdict/v1` schema + examples to document the new acceptance criterion. If unintentional, revert and require all canon claims to validate.
2. **`src/runtime/parleyRuntime.js:400` — `mergeById` prefers semantic key over id** *(copilot, security/correctness)*
   - Two distinct entities with the same `text`/`name` (e.g. two NPCs both named "Guard") collapse into one; can also overwrite canon facts/leads with intentionally distinct ids.
   - Action: prefer `id` when present; only fall back to semantic key when both records lack an id.
3. **`src/runtime/parleyRuntime.js:401` — same root cause as #2** *(gemini)*
   - `memoryMergeKey` semantic-first dedup loses distinct artifacts that share a `text`/`name`.
   - Action: same fix as #2.
4. **`src/runtime/dm/detourContracts.js:43` — `validateActionInterpretation` missing required fields** *(copilot)*
   - `id`, `player_action`, `scene_id` are not enforced; schema-correct artifacts can persist without them.
   - Action: add `requiredString` checks for each.
5. **`src/runtime/dm/detourContracts.js:55` — `validateStoryAttractor` no allowed-key set** *(copilot)*
   - Other detour validators reject unexpected fields; this one silently accepts typos.
   - Action: add `allowedKeys(...)` matching the other validators.
6. **`src/runtime/dm/detourContracts.js:113` — `validateStoryConsequence` accepts malformed `rejected_claims`** *(copilot)*
   - `rejected_claims` field shape unchecked; non-arrays or items missing `claim`/`reason` persist.
   - Action: add `optionalArray("rejected_claims")` with item shape validation.
7. **`src/runtime/dm/detourTools.js:133` and `:138` — `normalizeText(phrase)` in nested loops** *(gemini)*
   - Static guidance data normalized on every turn inside `every` + `some` / `filter`.
   - Action: pre-normalize guidance phrases at scenario load.
8. **`src/runtime/dm/detourTools.js:144` — scoring heuristic biases small `matchAnyGroups`** *(gemini)*
   - `matchCount + required.length + matchAnyGroups.length` rewards count over specificity.
   - Action: weight by group specificity (e.g. inverse group size) or document the bias as intentional.

---

## Summary stats
- **OPEN** items requiring a code change in the cleanup PR: ~28 (concentrated in PRs #5–#10)
- **NOTED** items: PRs #1–#4, plus partial #5 and #8 (verify the existing follow-up commit fixes hold after merge)
- **Security-flagged** items still OPEN: PR #6 path traversal (#2), PR #10 yes-and rejection passthrough (#1), PR #10 mergeById id collapse (#2/#3)

Pre-flight before opening the cleanup PR:
1. Re-pull the `main` tree after all 10 merges to make sure line numbers above still point at the right code.
2. Convert each **OPEN** item into a TODO in the cleanup branch; group commits by file/system for easier review.
3. For each item flagged "update the schema/example", make sure docs + JSON schema + example all move together.

---

## Verification Results (2026-05-03, post-cleanup)

After landing the cleanup commits on `cleanup/post-stack-followups`, the
NOTED spot-checks confirm the originating follow-up commits did fix what
they claimed:

- **PR #1 smoke-last-lantern.sh** — `mktemp -d "${TMPDIR:-/tmp}/parley-last-lantern.XXXXXX"`
  defaults to a temp `BELAYER_HOME`; opt-in via `SMOKE_BELAYER_HOME`.
- **PR #2 docs** — `SillyTavern` capitalization correct in the addendum
  spec; `parley-world-state/v1` namespace in `examples/last-lantern/artifacts/world-state.json`.
- **PR #3 contracts** — character-contract.md states "missing `tags` block
  and empty `tags` block are both contract violations" at line 23 + 146;
  truth-authority-contract.md `Verdict Shape` includes `hidden_truth_writes`.
- **PR #4 server.js** — `readJsonBody` throws `statusCode = 413` on
  oversized bodies; transcript renders via incremental append
  (`syncTranscript` only iterates entries beyond `transcript.children.length`).
- **PR #5 client/app.js** — no Mara-specific hardcoded notes/status
  strings remain.

The `OPEN` items in PRs #5–#10 plus #9 docs are addressed in the
companion commits on this branch:

| Commit                                          | Items |
| ----------------------------------------------- | ----- |
| `fix: harden security-flagged...`               | PR #6 path traversal, PR #10 mergeById id collapse, PR #10 yes-and schema docs |
| `fix: tighten truth contract guards from PR #7` | verdict id, fail handling, hidden-truth sidecar, loose-author canon relax, null author guard, responseId default, normalizeFactText |
| `fix: harden scenario pack loading...`          | listScenarioPacks resilience, deeper validateScenarioPack, threaded stateDir/worldDir into evidence paths, knowledgeBoundary fallback |
| `fix: tighten PR #5 smoke + persistence...`     | tighter Ashford lead invariant, JSONL parsing assertions, lead bucket schema/spec, dropped workstation path |
| `fix: PR #8 visual asset client status...`      | unknown status passthrough |
| `fix: tighten DM detour validators...`          | action interpretation required fields, story attractor allowedKeys, story consequence rejected_claims, pre-normalize guidance phrases |
| `docs: address PR #9 instance wiki...`          | default_view definition, deferring typo, promotion atomicity, instance id consistency, target allowlist, may_read grammar |
