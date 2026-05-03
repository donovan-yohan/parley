# Parley Truth Authority Contract — `parley-truth-verdict/v1`

## Purpose

Defines the second-LLM-style authority that decides what becomes canon. It sits
between GM narration and any state mutation. Nothing reaches `world-state.json`
without a verdict.

The truth authority is not the GM. The GM proposes. The authority disposes.
Splitting these roles is the main defense against canon rot, agent soup, and
narrator overconfidence.

## Authority Boundary

The authority has read access to:

- prior `world-state.json`
- the active scene seed
- the character records of every speaker in the proposed turn
- the proposed turn artifact (player input, GM narration, character contributions)
- the proposed state delta

It does not:

- generate narration
- decide next choices
- spawn talents
- modify character records directly

It returns a verdict object. The runtime applies (or rejects) the delta based
on the verdict.

## Six Truth Categories

Every claim in a turn is bucketed into exactly one of these:

| Category           | Example                                                    | Persisted as                                  |
|--------------------|------------------------------------------------------------|-----------------------------------------------|
| `canon`            | "Mara is the tavernkeep at the Last Lantern."              | `world-state.timeline` + `characters` entry   |
| `character_belief` | "Mara thinks Garrick is lying about the toll."             | `open_threads` with `kind=belief`, attributed |
| `rumor`            | "They say the north stones move when no one watches."      | `open_threads` with `kind=rumor`              |
| `lead`             | "The old north road shows recent wagon ruts worth following." | `world-state.leads`, kept until promoted/dropped |
| `unresolved`       | "Something happened with the Ashford line. Unclear what."  | `open_threads` with `kind=mystery`            |
| `hidden_truth`     | Author-only fact not yet shown to player                   | NOT in world-state. Author-only sidecar.      |

`lead` is distinct from `rumor` (which is a public-facing whisper) and from
`unresolved` (which is a player-visible open mystery). Leads describe a
specific next-step opportunity the runtime should keep alive in
`world-state.leads` until either promoted to `canon` (via
`parley-canon-promotion-policy`) or explicitly dropped.

Hidden truths must never be written to player-visible artifacts. They live in a
separate file (`worlds/<w>/state/hidden-truth.jsonl`) the UI does not read.

## Verdict Shape

```yaml
schema_version: parley-truth-verdict/v1
verdict_id: verdict-0002
turn_id: turn-0002
checked_at: 2026-05-02T00:00:00Z
authority: deterministic-mock      # or "llm:anthropic/claude-haiku-4-5"
verdict: pass                      # pass | revise | fail
findings:
  - claim_id: c1
    text: "Mara warned the player not to say the Ashford name loudly."
    category: canon
    accepted: true
    evidence:
      - artifacts/turns.jsonl#turn-0003
  - claim_id: c2
    text: "The north stones literally move at night."
    category: rumor
    accepted: true
    notes: "Allowed as in-world rumor; not promoted to canon."
  - claim_id: c3
    text: "Mara is secretly an Ashford heir."
    category: hidden_truth
    accepted: false
    notes: "Character speculated outside knowledge scope. Demoted to belief or rejected."
state_delta:
  applied:
    - path: timeline
      op: append
      value: { id: turn-0003, summary: "...", participants: [player, mara-underbough] }
    - path: open_threads
      op: append
      value: { id: ashford-name, kind: rumor, summary: "..." }
  rejected:
    - reason: "Claim c3 violates mara-underbough.knowledge_scope.forbidden."
      claim_id: c3
required_fixes: []
hidden_truth_writes: []
```

## Verdict Values

- `pass` — runtime applies `state_delta.applied` and emits the player-facing
  narration unchanged.
- `revise` — runtime applies `state_delta.applied` but must regenerate the
  parts of narration tied to rejected claims. `required_fixes` lists what must
  change.
- `fail` — runtime rolls back. No world-state, turn, or DM-artifact
  files are committed; the verdict itself is still appended to
  `state/truth-verdicts.jsonl` so the failure is durable evidence the
  GM and reviewers can replay. The GM gets the findings and retries.
  After N retries (default 2) the run halts and logs.

The verdict object's identifier may be supplied as either the JS-style
`id` field or the documented `verdict_id` field. The runtime accepts
either, populates `id` from `verdict_id` when only the latter is
present, and validates that at least one is non-empty.

## Handled Rejection Pattern (yes-and detours)

A turn author may propose a claim that the truth authority cannot accept as
canon (typically a disruptive player-driven claim such as `c4` in the example).
A DM detour author may absorb that rejection by emitting a deterministic
consequence narration that acknowledges the disruption without promoting the
claim.

When the runtime is invoked with `handledRejectedClaims`, those entries are
appended to `handled_rejected_claims` (each carrying `handled: true` and a
`handled_by` provenance string) and do **not** count toward the blocking set
that demotes a verdict from `pass` to `revise`.

Authority contract requirements for handled claims:

- The handling provenance (`handled_by`) must reference a registered detour
  contract. Today that is `dm-detour-tools/v1`.
- The original `claim_id` and `text` must be preserved verbatim so downstream
  consumers can audit what was disrupted vs. canonized.
- Handled claims never write into `state_delta.applied`. Their only effect on
  state is the consequence narration the detour author already produced.

Without an active detour author, a turn that proposes unsupported canon must
still be downgraded to `revise`. This pattern is opt-in per turn, not the
authority's default behavior.

## Knowledge Scope Enforcement

For each character contribution, the authority cross-checks against the
character's `knowledge_scope`:

- claim is in `knows` → eligible for `canon` if scene seed supports it
- claim is in `suspects` → at most `character_belief`
- claim is in `forbidden` → reject or demote, never canon
- claim is outside all three → `rumor` or reject; never canon without seed
  evidence

Authority cites the violated bucket in `findings[].notes` so the GM can fix.

## Determinism Requirement

MVP authority is deterministic by default. It must:

- give the same verdict for the same `(world_state, scene, turn)` tuple
- never call out to non-pinned LLMs in the smoke path
- be replaceable later by an LLM-backed implementation behind the same shape

The runtime must not assume the authority is the same model as the GM. They
should be separately swappable.

## Distinct From Belayer Gate

Belayer gates are mechanical (artifact present? schema valid? gate condition
strings satisfied?). The truth authority is semantic (do these claims belong
in canon?). Both must pass for a turn to commit:

```
GM narration
   ↓
truth authority verdict   ← new contract here
   ↓ (pass / revise)
state delta applied
   ↓
Belayer continuity gate   ← existing mechanical gate
   ↓
turn committed
```

A failing truth verdict can short-circuit before the Belayer gate runs.

## Hidden Truth Handling

If the GM proposes a claim tagged `hidden_truth=true` (author intent) the
authority routes it to `worlds/<w>/state/hidden-truth.jsonl` and does not
include it in any player-visible delta. The verdict still records that the
claim was processed; just `accepted: true, category: hidden_truth, surfaced:
false`. The UI must never read the hidden-truth file.

## Open Path: LLM-backed Authority

Eventual upgrade is straightforward — same input, same output, different
implementation. Recommended starter prompt template lives in
`worlds/<w>/SCHEMA.md` (the world bible documents what evidence the authority
should weigh for that world's tone). Until then, the deterministic MVP just
checks knowledge-scope buckets and seed coverage.

## Instance-Only Authority Context

The authority reads active instance artifacts, not template roots. Templates are
setup inputs only. During gameplay, the truth authority may inspect the active
world instance, active story instance, prior instance state, relevant character
records, proposed turn artifact, and hidden-truth boundaries if the validator role
requires them.

It must not read world or story templates during gameplay. That avoids conflicts
between original template canon and the player's evolved world instance canon.

## Promotion Candidates, Not Auto-Canon

For significant events, the authority may recommend a promotion candidate. This is
still not canon. It is a pending governance artifact that a DM/human accepts or
rejects later.

```text
story/state/turns.jsonl
story/state/truth-verdicts.jsonl
story/state/promotion-candidates.jsonl   # pending, not canon
  ↓ DM/human acceptance
world/canon/facts.jsonl
world/state/world-state.json
world/log.md
```

See [`parley-canon-promotion-policy.md`](./parley-canon-promotion-policy.md).
