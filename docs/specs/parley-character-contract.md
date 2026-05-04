# Parley Character Contract — `parley-character/v1`

> **STATUS:** Extended by PR #22 (instance materialization writes
> `.belayer-talent.yaml` for each named NPC) and PR #25 (art talents
> `background-artist` / `portrait-artist` are also materialized per crag). See
> `docs/plans/2026-05-04-belayer-profile-coupling.md` for the as-shipped scope.

## Purpose

Defines how Parley represents a character on top of Belayer generated talent.

A Parley character is the story-facing record. Belayer holds the generic talent
substrate (id, lifecycle, source request, mechanical metadata). Parley owns
narrative shape (tags, voice, knowledge boundaries, portrait, callbacks).

Belayer must remain story-blind. No story-specific noun should appear in any
Belayer schema or tool argument. Parley character records reference the Belayer
talent by id; Belayer never references Parley fields.

## Hard Rules

- Every generated NPC is reusable by default.
- Default lifecycle is `resumable`.
- Character id is a stable slug (e.g. `mara-underbough`). Slug is the join key
  to the Belayer talent record and to the file path under `characters/`.
- A character record always references the source `turn_id` and the Belayer
  `talent_id` that produced it.
- Tags are first-class. A missing `tags` block and an empty `tags` block are
  both contract violations.
- Belief, rumor, and hidden author truth never live on the character record.
  They live on world-state and truth-verdict artifacts. Character records hold
  only the character's stable identity, voice, and known-knowledge boundaries.

## Substrate Mapping

| Parley field             | Source / owner                                   |
|--------------------------|--------------------------------------------------|
| `id`                     | Parley slug; matches Belayer `talent.id`         |
| `talent_id`              | Belayer `generated-talent` record id             |
| `lifecycle`              | Belayer (`resumable` / `ephemeral`)              |
| `source_request`         | Belayer `talent-request.request_id` (`turn-XXXX`)|
| `domain`                 | Belayer (`story` for Parley)                     |
| `role`                   | Belayer mechanical role (`tavernkeep`, etc.)     |
| `name`, `voice`, `tone`  | Parley                                           |
| `tags`                   | Parley                                           |
| `knowledge_scope`        | Parley                                           |
| `portrait`               | Parley                                           |
| `provenance`             | Parley (links to artifacts that justify reuse)   |

Parley reads `lifecycle`, `talent_id`, and `source_request` from the Belayer
record and copies them onto the Parley record at creation. They are denormalized
on purpose so the character page is human-readable without joining.

## Tag Model

Tags are flat key/value. Multi-value tags are arrays. Implementations must
accept any tag, but the runtime SHOULD recognize and index these:

| Tag             | Type           | Meaning                                                       |
|-----------------|----------------|---------------------------------------------------------------|
| `location`      | string \| array | Where the character is normally found. Slug from `lore/locations/`. |
| `role`          | string         | Story role (`tavernkeep`, `informant`, `rival`, `bystander`). |
| `importance`    | enum           | `bit_part` \| `recurring` \| `key`. Drives recall priority.    |
| `faction`       | string \| array | Faction slug from `lore/factions/`. Empty if unaffiliated.    |
| `scene`         | string \| array | Scene slugs the character has appeared in.                    |
| `tone`          | string \| array | Voice descriptors (`weary`, `wry`, `guarded`).                |
| `memory_scope`  | enum           | `scene` \| `arc` \| `world`. How wide the recall window is.   |
| `portrait`      | enum           | `missing` \| `prompt_ready` \| `generated` \| `locked`.       |

`importance` and `memory_scope` together drive whether the GM should recall a
character on later turns. `importance=bit_part` + `memory_scope=scene` means the
character is reusable but not actively surfaced.

## Knowledge Scope

Mechanism for keeping characters from inventing canon. Stored on the character
record, consumed by both narration prompts and the truth authority.

```yaml
knowledge_scope:
  knows:
    - "Local rumors traded in the Last Lantern."
    - "Names of the regulars and their tabs."
  suspects:
    - "Ashford lineage trouble — won't say it loud."
  forbidden:
    - "Author-only hidden truth about the north stones."
    - "Anything outside the tavern's social reach."
```

`knows` is what the character can speak as their own truth. `suspects` is
character belief, not canon. `forbidden` is hard-fenced — the character must
refuse or deflect. Truth authority uses these lists to grade contributions.

## Portrait Block

Always present. Defaults to `missing`. See
[`parley-portrait-seam.md`](./parley-portrait-seam.md) for the full pipeline.

```yaml
portrait:
  status: missing            # missing | prompt_ready | generated | locked
  prompt_path: null          # worlds/<w>/assets/portraits/<id>.prompt.md
  asset_path: null           # worlds/<w>/assets/portraits/<id>.png
  seed: null                 # optional, for deterministic regen
  style_ref: art-style.md    # world art style anchor
```

`locked` means human-approved. Pipeline must not overwrite.

## Provenance

Every reusable claim links back to evidence so callbacks don't drift.
The source Belayer talent link is the root-level `talent_id`; provenance does
not rename or duplicate that reference.

```yaml
provenance:
  created_in_turn: turn-0002
  established_facts:
    - artifact: state/world-state.json
      fact_id: tavernkeeper-mara-warned-ashford-name
  rumors_introduced:
    - artifact: state/world-state.json
      rumor_id: north-stones-old-debts
```

If a future scene wants to recall Mara saying X, the runtime checks provenance.
If X is not in `established_facts` or in the world state, the GM treats it as
character belief, not canon.

## Reuse Lifecycle

1. GM emits Belayer `talent-request` with `domain=story` and a role.
2. Belayer scaffolds the generated talent record (mechanical only).
3. Parley creates the character page under `worlds/<w>/characters/<id>.md` with
   the tag block, knowledge scope, and provenance pointer.
4. World state references the character by id.
5. Future scenes that want this character look up the page by slug or by tag
   query (e.g. `tag:location=last-lantern-tavern AND tag:importance>=recurring`).
6. Promotion: `importance` may be raised by a curator step. Demotion is allowed
   but should be logged in `log.md`.

## Forbidden Shapes

- Storing rumor content on the character record.
- Storing per-other-character beliefs on the record (that is Honcho's eventual
  job; for MVP, beliefs live in world state under `open_threads` or in turn
  artifacts).
- Renaming Belayer talent fields to story words inside the Belayer record.
- Treating an absent `tags` block as "no tags." Empty tags means the producer
  forgot to tag, and the runtime should either reject or auto-tag from context.

## Open Path: Honcho

Once Honcho integrates, peer beliefs (`Mara distrusts Garrick`) move out of
character pages and into Honcho perspective stores. The character record stays
stable. This is intentionally deferred — the contract above does not require
Honcho to ship.

## Instance Character Knowledge / Non-Omniscience

In the template/instance architecture, template character records may remain
compact, but materialized instance character records should grow toward
`parley-character/v2` with machine-readable context boundaries:

- `knowledge_scope.knows`, `suspects`, `mistaken_beliefs`, `forbidden`;
- `knowledge_scope.may_read` and `must_not_read`;
- `sharing_guidance` for reluctance, trust, and disclosure conditions;
- `relationships` keyed by player or other character id.

The goal is to keep NPCs true to themselves without handing them the full world
wiki. A character context builder should filter hidden truth, full story logs,
pending promotion candidates, template roots, and private other-character beliefs.
See [`parley-character-knowledge-privacy.md`](./parley-character-knowledge-privacy.md).
