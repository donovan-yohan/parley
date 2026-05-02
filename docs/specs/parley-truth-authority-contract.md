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

## Five Truth Categories

Every claim in a turn is bucketed into exactly one of these:

| Category           | Example                                                    | Persisted as                                  |
|--------------------|------------------------------------------------------------|-----------------------------------------------|
| `canon`            | "Mara is the tavernkeep at the Last Lantern."              | `world-state.timeline` + `characters` entry   |
| `character_belief` | "Mara thinks Garrick is lying about the toll."             | `open_threads` with `kind=belief`, attributed |
| `rumor`            | "They say the north stones move when no one watches."      | `open_threads` with `kind=rumor`              |
| `unresolved`       | "Something happened with the Ashford line. Unclear what."  | `open_threads` with `kind=mystery`            |
| `hidden_truth`     | Author-only fact not yet shown to player                   | NOT in world-state. Author-only sidecar.      |

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
```

## Verdict Values

- `pass` — runtime applies `state_delta.applied` and emits the player-facing
  narration unchanged.
- `revise` — runtime applies `state_delta.applied` but must regenerate the
  parts of narration tied to rejected claims. `required_fixes` lists what must
  change.
- `fail` — runtime rolls back. Nothing is committed. The GM gets the findings
  and retries. After N retries (default 2) the run halts and logs.

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
