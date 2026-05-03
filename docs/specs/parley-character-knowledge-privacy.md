# Parley Character Knowledge and Non-Omniscience Contract

## Purpose

Characters need enough context to feel consistent, but not enough context to become
omniscient. A tavernkeep can know local rumors, social dynamics, and what the player
said in front of her. She should not know hidden truths, off-screen faction plans, or
another character's private beliefs unless the active instance says she learned them.

This document defines what character records should expose and what context builders
must filter before giving a character to an LLM-style agent.

## Core Rule

Game Master and validator contexts may read broad instance context. Character contexts
must be filtered through the character's knowledge scope, relationships, witnessed
turns, and sharing guidance.

A character agent is not the world wiki with a voice slapped on it. That is how NPCs
become lore-leaking vending machines. gross.

## Character Record Shape

`parley-character/v1` already has a prose `knowledgeBoundary`. The instance-oriented
shape should make this machine-readable without making authoring miserable.

Recommended `parley-character/v2` frontmatter:

```yaml
schema_version: parley-character/v2
id: mara-underbough
name: Mara Underbough
role: tavernkeep
lifecycle: resumable
importance: recurring
faction: last-lantern-staff
tags:
  - location:last-lantern-tavern
  - role:tavernkeep
  - importance:recurring
  - faction:last-lantern-staff
  - tone:warm-watchful

knowledge_scope:
  knows:
    - local rumors traded in the Last Lantern
    - visible tavern history
    - regulars, tabs, and public debts
  suspects:
    - Ashford lineage trouble is tied to the old north road
  mistaken_beliefs: []
  forbidden:
    - author-only truth about the north stones
    - events outside the tavern unless someone told her
  may_read:
    - self
    - active_scene
    - witnessed_turns
    - public_canon:location:last-lantern-tavern
    - public_canon:faction:last-lantern-staff
  must_not_read:
    - hidden_truth
    - full_world_wiki
    - full_story_log
    - pending_promotion_candidates
    - private_other_character_beliefs

sharing_guidance:
  default_posture: warm-watchful
  reluctance: guarded
  shares_if:
    - player asks privately
    - player has helped the tavern
    - sharing protects someone vulnerable
  deflects_if:
    - player asks in a crowded room
    - answer would expose hidden truth
    - player has not earned trust

relationships:
  player:
    closeness: stranger
    trust: low
    disclosure: public-rumors-only
```

## Context Builders

The implementation should eventually expose three different builders.

### Character context

For in-character NPC calls.

Allowed:

- the character's own page;
- active scene summary;
- current player action;
- relevant public canon matching `may_read`;
- witnessed recent turns;
- relationship entry involving the player or present speakers;
- sharing guidance.

Forbidden:

- `hidden-truth.jsonl`;
- full world wiki dumps;
- full story log;
- pending promotion candidates;
- private beliefs of absent characters;
- template roots.

### GM context

For the narrator/DM.

Allowed:

- active world instance wiki;
- active story instance wiki;
- current scene;
- all present character records;
- story log summaries;
- hidden truth if the DM role needs it;
- promotion policy.

The GM can know more than an NPC, but should still write NPC dialogue through that
NPC's filtered knowledge and sharing guidance.

### Validator context

For truth authority / lore validator.

Allowed:

- GM context;
- all speaker knowledge scopes;
- proposed claims;
- source turns;
- hidden-truth boundaries.

The validator checks whether narration and dialogue violated character knowledge.

## Verdict Rules

| Character claim | Max allowed category | Validator behavior |
| --- | --- | --- |
| In `knowledge_scope.knows` and supported by instance canon | `canon` | Accept if evidence supports it |
| In `knowledge_scope.suspects` | `character_belief` | Accept as belief, not canon |
| In `mistaken_beliefs` | `character_belief` | Accept with mistaken flag |
| In `forbidden` | none | Reject or require revision |
| Outside scope but plausible public rumor | `rumor` | Accept only as rumor, never canon |
| Hidden truth leaked by NPC | none | Reject and require revision |

## Sharing Is Separate From Knowing

A character can know a fact and still refuse to share it. This matters for gameplay.
The GM should model reluctance, trust, pressure, privacy, leverage, and relationship.

Example:

```yaml
sharing_guidance:
  reluctance: high
  shares_if:
    - player asks after closing
    - player has established trust>=medium
  deflects_if:
    - player asks in front of strangers
```

This is not infra-heavy. It is authoring guidance that later becomes prompt/context
input and validator criteria.

## First Slice Recommendation

Do not build NPC agent infra yet. Add the contract and tests around filtered context
when the instance loader lands.

Minimum implementation target for next runtime PR:

1. Add `buildCharacterContext(instance, characterId, sceneId)`.
2. Assert it excludes hidden truth and template paths.
3. Assert it includes sharing guidance and relationship/closeness.
4. Teach truth authority tests to reject one over-omniscient character claim.

That is enough to catch the failure mode without inventing a full social simulator.
