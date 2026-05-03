# Storytelling Eval Framework Research — 2026-05-02

## Goal

Parley needs tests that answer:

- did the narrative engine preserve canon?
- did NPCs do their jobs?
- did the output define lore and characters rather than hardcode story?
- can story emerge from interaction?
- did a UI/prose/prompt change make the experience better or worse?

Normal unit tests are not enough. Pure vibes are also not enough. god help us, we need evals.

## Recommended stack

```text
node:test / Vitest deterministic tests
        +
Promptfoo local eval suite
        +
custom Parley trajectory runner
        +
JSONL scenario datasets
        +
custom deterministic scorers
        +
LLM rubric / pairwise judge later
        +
Braintrust or LangSmith later for tracking
```

## Framework options

| Tool | Fit | Use |
|---|---:|---|
| node:test / Vitest / Jest | excellent now | hard invariants, schemas, snapshots, deterministic runtime checks |
| Promptfoo | excellent next | local-first LLM evals, JS assertions, rubrics, model comparison |
| Braintrust | strong later | experiment tracking, TypeScript SDK, historical comparison |
| LangSmith | strong if using LangChain | traces, datasets, online/offline evals |
| DeepEval | useful later | Python-first rubric evals, GEval-style scoring |
| OpenAI Evals/API | useful later | provider-native eval dashboard and graders |
| Ragas | niche later | memory/RAG quality, retrieval precision/recall |
| Custom JS metrics | essential | canon checks, repetition, readability, named entity preservation |

## Phase 0: deterministic tests

Start with local tests that do not need live model calls.

Test:

- prompt rendering,
- schema validity,
- character/lore contract shape,
- state reducer behavior,
- truth verdict persistence,
- memory/canon extraction,
- UI-visible player-facing state translation.

Pass gate:

- all hard invariants pass,
- no schema drift,
- no unreviewed snapshot diffs,
- known lore facts remain stable.

## Phase 1: e2e story smoke tests

Current short tests should do more than “HTTP 200.”

Each e2e test should:

1. start the real local server,
2. submit a player action,
3. read actual API output,
4. inspect persisted artifacts,
5. assert player-facing state makes sense,
6. print a development log with highs/lows.

Example invariant checks:

- response includes Mara Underbough,
- reusable NPC exists,
- Mara is tavernkeep/resumable,
- old north road becomes a rumor/lead,
- Ashford remains unresolved,
- output does not claim the player feels/thinks/acts beyond submitted action,
- story-specific data lives in Parley files, not Belayer.

## Phase 2: trajectory simulation

This is the core “simulate similar stories over time” layer.

A trajectory is:

```text
initial world + character state
+ scripted player/director turns
+ generated outputs
+ memory/canon updates
+ scores per turn and whole run
```

The same trajectory should run across branches/prompts/models.

Track:

- transcript,
- extracted facts,
- canon state,
- contradictions,
- memory recalls,
- NPC behavior checks,
- judge/rubric scores,
- deterministic metrics,
- model/prompt/git SHA.

## Suggested JSONL test shape

```json
{
  "id": "last-lantern-old-road-001",
  "suite": "npc_lore_emergence",
  "tags": ["fantasy", "last-lantern", "mara", "lore", "emergent-story"],
  "initialState": {
    "world": "last-lantern",
    "scene": "last-lantern-tavern",
    "canonFacts": [
      "Mara Underbough is the tavernkeep of the Last Lantern.",
      "The old north road is tied to rumors of unpaid debts.",
      "The Ashford name is dangerous to speak openly."
    ],
    "characterJobs": [
      "Mara should be warm but watchful.",
      "Mara should reveal rumor, not full hidden truth.",
      "Mara should remain reusable after the turn."
    ]
  },
  "trajectory": [
    {
      "userInput": "I ask who remembers the old north road.",
      "mustInclude": ["Mara", "old north road"],
      "mustCreateLead": ["old north road", "Ashford"],
      "mustNotReveal": ["full hidden Ashford truth"],
      "mustPreserveAgency": true
    }
  ]
}
```

## Rubric dimensions

Use deterministic checks first, then LLM rubric judges later.

Recommended dimensions:

- canon adherence,
- character consistency,
- NPC job completion,
- player agency preservation,
- lore emergence,
- scene motion,
- prose specificity,
- pacing,
- voice distinction,
- hidden-truth discipline,
- playable ending quality.

## Pairwise comparison

For subjective improvements, compare candidate vs baseline.

```text
same scenario
same prior context
baseline output vs candidate output
blind randomized judge order
winner + rationale + dimension scores
```

Pairwise is usually more stable than asking “rate this 1-5” in isolation.

## Suggested pass/fail gates

For short local tests:

- 100% hard checks pass.
- no forbidden player agency violations.
- no hidden truth leak.
- all required NPC jobs pass.
- persisted artifacts match schema.

For larger trajectory evals:

- canon consistency >= 0.95,
- memory recall >= 0.90 for explicit facts,
- average rubric score >= 3.8/5,
- no critical scenario drops below threshold,
- candidate does not regress more than 2-3% unless intentionally trading off.

## Immediate implementation recommendation

Add a local script:

```bash
npm run smoke:e2e
```

It should:

- call the runtime or local API,
- print the actual narration,
- print NPC/job checks,
- print persisted artifact checks,
- write a markdown journey/report under `docs/research/` or `docs/devlogs/`,
- fail if the narrative engine becomes pure hardcoded branch text.

This is not a full Promptfoo suite yet. It is the first non-stupid test we need.

After that, add Promptfoo as the first external eval framework.
