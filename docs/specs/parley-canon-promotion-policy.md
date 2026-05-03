# Parley Story Log / Canon Promotion Policy

## Purpose

Parley needs a hard line between "what happened in the story log" and "what is now
canon in this world instance." Most turn details are evidence, not canon. Important
events become promotion candidates. A DM/human accepts or rejects those candidates.

No gameplay agent should directly promote world canon.

## Artifact Responsibilities

| Artifact | Role |
| --- | --- |
| `story/state/turns.jsonl` | Immutable story log. What happened at the table/session. |
| `story/state/truth-verdicts.jsonl` | Semantic review trail. What claims were accepted, demoted, rejected, or flagged. |
| `story/state/promotion-candidates.jsonl` | Proposed canon changes needing DM/human decision. Not canon. |
| `story/state/promotions.jsonl` | Accepted/rejected promotion audit trail. |
| `world/canon/facts.jsonl` | Accepted world-instance canon facts. |
| `world/state/world-state.json` | Machine snapshot of current world instance state. |
| `world/log.md` | Human-readable changelog of accepted world-instance changes. |

## Rule

Story log records evidence. World instance canon records accepted truth.

Promotion never rewrites the story log. It appends canon with provenance that cites
the story log and truth verdicts.

## Promotion Candidate Shape

```json
{
  "schema_version": "parley-promotion-candidate/v1",
  "id": "promo-0001",
  "status": "pending",
  "source": {
    "world_instance": "kyle-last-lantern-first-rumor",
    "story_instance": "first-rumor-001",
    "turn_ids": ["turn-0007"],
    "verdict_ids": ["verdict-0007"],
    "claim_ids": ["c5"]
  },
  "current_category": "rumor",
  "proposed_category": "canon",
  "summary": "The red-scarfed drover reacted to the Ashford name and left before closing.",
  "proposed_writes": [
    {
      "target": "world/canon/facts.jsonl",
      "op": "append",
      "value": {
        "id": "red-scarfed-drover-reacted-ashford",
        "category": "canon",
        "summary": "The red-scarfed drover reacted to the Ashford name and left before closing."
      }
    }
  ],
  "promotion_reason": "Recurring mystery clue with future story impact.",
  "requires_dm_acceptance": true,
  "created_at": "2026-05-03T00:00:00Z"
}
```

## Promote vs Keep In Story Log

| Event type | Story log | Candidate? | World canon? |
| --- | ---: | ---: | ---: |
| Player dialogue | Yes | Rarely | Rarely |
| Normal scene action | Yes | No | No |
| Temporary NPC mood | Yes | No | No |
| Clue discovered | Yes | Maybe | Only if accepted |
| Rumor heard | Yes | Maybe | Usually rumor/open thread |
| NPC belief | Yes | Maybe | Belief, not canon |
| Named recurring NPC created | Yes | Usually | If accepted |
| Location materially changed | Yes | Usually | If accepted |
| Faction leadership/power changed | Yes | Usually | If accepted |
| Major death or betrayal | Yes | Usually | If accepted |
| Secret revealed to player | Yes | Usually | Discovered fact, not necessarily global truth |
| World rule changed | Yes | Almost always review | Almost never without author/DM approval |
| Template contradiction | Yes as conflict | Escalate | Only in instance, never template |

## Candidate Lifecycle

```text
pending
  -> accepted
  -> rejected
  -> deferred
  -> needs-author-review
```

Accepted candidates update instance canon. Rejected and deferred candidates stay in
story state and do not alter world canon.

## Human/DM Acceptance

The first implementation should be deterministic and file-backed:

```bash
node scripts/accept-promotion-candidate.mjs \
  --instance instances/kyle-last-lantern-first-rumor \
  --story first-rumor-001 \
  --candidate promo-0001 \
  --actor dm:kyle
```

The script should:

1. Read the pending candidate.
2. Validate it has evidence turns and verdicts.
3. Validate every `proposed_writes[].target` against the target
   allowlist (see below). Reject the candidate if any target is not
   allowlisted.
4. Append to `story/state/promotions.jsonl`.
5. Append canon to `world/canon/facts.jsonl` or the target lore file.
6. Update `world/state/world-state.json`.
7. Append a line to `world/log.md` with actor, timestamp, evidence, and candidate id.
8. Leave `turns.jsonl` byte-identical.

### `proposed_writes[].target` allowlist

The target field must match one of these prefixes. Anything else fails
validation, in particular `story/state/turns.jsonl` is forbidden (step 8
requires it byte-identical):

| Allowed prefix                   | Purpose                                    |
| -------------------------------- | ------------------------------------------ |
| `world/canon/facts.jsonl`        | Append a canon fact entry                  |
| `world/state/world-state.json`   | Update the materialized world snapshot     |
| `world/log.md`                   | Append a human-readable changelog line     |
| `world/lore/locations/<id>.md`   | Append/update a durable location record    |
| `world/lore/factions/<id>.md`    | Append/update a durable faction record     |
| `story/state/promotions.jsonl`   | Append the audit trail entry               |

Forbidden prefixes (validator must reject):

- `story/state/turns.jsonl`
- `story/state/truth-verdicts.jsonl`
- anything outside `world/` or `story/state/promotions.jsonl`

A UI can come later. Do not block the contract on UI.

## Validator Responsibility

The truth authority can recommend a candidate. It cannot promote it.

It should flag likely candidates when:

- an event changes durable world conditions;
- a recurring character is created, killed, transformed, or gains a new lasting role;
- a location/faction/timeline changes;
- a mystery clue becomes established enough to matter later;
- a hidden truth is surfaced to the player and needs discovered-state tracking.

It should not flag:

- scene flavor;
- jokes;
- one-off descriptions;
- unsupported player claims;
- private thoughts with no external evidence.

## Anti-Goals

- No auto-canon promotion by GM or character agents.
- No template writes during gameplay.
- No full CMS in the first slice.
- No destructive rewrite of prior story logs.
- No hidden truth in player-visible canon files.
