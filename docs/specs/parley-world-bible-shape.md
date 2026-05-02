# Parley World Bible / Library Shape

## Purpose

Defines the on-disk shape of a Parley world. Human-readable, agent-readable,
LLM-Wiki / Obsidian compatible. This is the lore-and-state surface, separate
from runtime code.

A world directory is the unit of authoring, sharing, and reuse. One world,
one directory. Multiple stories live inside one world.

## Layout

```text
worlds/<world-slug>/
  WORLD.md                  # what this world is, in one page
  SCHEMA.md                 # which contracts/schemas this world commits to
  index.md                  # entry point — links into the rest
  log.md                    # append-only changelog of bible edits
  art-style.md              # visual style anchor for portraits + illustrations
  lore/
    locations/<id>.md
    factions/<id>.md
    rumors/<id>.md          # pre-seeded ambient rumors (optional)
  characters/<id>.md        # one Markdown page per reusable character
  scenes/<id>.yaml          # scene seeds (parley-scene/v1)
  state/
    world-state.json        # parley-world-state/v1, current snapshot
    turns.jsonl             # parley-turn/v1, append-only
    truth-verdicts.jsonl    # parley-truth-verdict/v1, append-only
    hidden-truth.jsonl      # author-only, never read by UI
  assets/
    portraits/<id>.png
    portraits/<id>.prompt.md
```

## File Roles

### `WORLD.md`
One-page premise. Genre, tone, era, scope. The thing a new contributor reads
first. Should fit on one screen. Links to `index.md` for the deep dive.

### `SCHEMA.md`
Lists which contract versions this world commits to:

```markdown
- parley-character/v1
- parley-turn/v1
- parley-world-state/v1
- parley-truth-verdict/v1
- parley-scene/v1
```

Plus per-world authority guidance: what evidence the truth authority should
weigh, what tone the GM should hold, what is hard-fenced as forbidden.

### `index.md`
Hand-curated link sheet. Locations, factions, characters, scenes, current
state. Optimized for "if an LLM has 4k tokens to load this world, what do they
need." Keep tight.

### `log.md`
Append-only. Every bible edit (location added, character demoted, rumor
promoted) gets a one-line entry with date and reason. This is how callbacks
stay honest — provenance is searchable.

### `art-style.md`
The world's visual anchor. Read by the portrait pipeline. Defines style words,
palette, era cues, banned visual tropes. See
[`parley-portrait-seam.md`](./parley-portrait-seam.md).

### `lore/`
Slow-changing canon. One file per concept. Markdown so humans edit them. Every
file should start with a small frontmatter block that the runtime can index:

```yaml
---
id: last-lantern-tavern
kind: location
tags:
  - crossroads
  - tavern
importance: key
---
```

### `characters/`
Reusable characters. One file per slug. Body is human prose; frontmatter is the
machine-readable `parley-character/v1` view. See
[`parley-character-contract.md`](./parley-character-contract.md). Generated
NPCs land here automatically when promoted from a turn.

### `scenes/`
YAML scene seeds. Format defined by `parley-scene/v1` (already exemplified by
`examples/last-lantern/scene.yaml`). Scenes reference locations and characters
by id, not by inline copies.

### `state/`
The runtime mutable surface. Three append-only logs plus one snapshot:

- `world-state.json` — current canon snapshot, rewritten each commit
- `turns.jsonl` — every turn artifact, append-only
- `truth-verdicts.jsonl` — every verdict, append-only
- `hidden-truth.jsonl` — author-only, not exposed to UI or to the GM at runtime

Append-only logs make replay and audit trivial. The snapshot makes "what is
true right now" cheap. They must agree; mismatches are a contract bug.

### `assets/portraits/`
PNG + prompt sidecar. See portrait seam. `.gitkeep` until generation runs.

## LLM Wiki Compatibility

The whole tree is a Markdown vault. It opens cleanly in Obsidian. Wiki-links
(`[[mara-underbough]]`) are encouraged inside Markdown bodies. Frontmatter is
machine-readable; bodies are human prose. Either side can update without
breaking the other, as long as frontmatter ids stay stable.

## What Belongs Where (Anti-Soup Rules)

| Question                                      | File                                  |
|-----------------------------------------------|---------------------------------------|
| What is this world about?                     | `WORLD.md`                            |
| What is the canon for this place?             | `lore/locations/<id>.md`              |
| What does this character know / sound like?   | `characters/<id>.md`                  |
| What rumors are live?                         | `state/world-state.json.open_threads` |
| What did the player just do?                  | `state/turns.jsonl`                   |
| What did the authority decide?                | `state/truth-verdicts.jsonl`          |
| What does the author know that nobody does?   | `state/hidden-truth.jsonl`            |
| What does Bob believe about Charlie?          | (Honcho, later — not MVP)             |

If a fact has more than one home, the bible is the authority and state derefs
it. If a fact only exists in turns, it is not canon yet.

## World Loading

Runtime loader contract:

1. Read `SCHEMA.md` to confirm contract versions match what runtime supports.
2. Load `WORLD.md` and `art-style.md` as system-prompt context.
3. Load active scene from `scenes/<scene-id>.yaml`.
4. Load referenced locations from `lore/locations/`.
5. Load referenced character pages from `characters/`.
6. Load latest `state/world-state.json`.
7. Stream `state/turns.jsonl` tail for short-term context.
8. Never load `hidden-truth.jsonl`.

The loader should fail fast if `SCHEMA.md` claims a contract version the
runtime does not implement. No silent downgrades.

## Sharing & Forking

A world directory is portable: copy it, change the slug, edit
`WORLD.md` + `SCHEMA.md`. The state directory should reset to empty/initial
when forking for new play. `log.md` is per-world, not per-session, so a fork
keeps lineage but starts a fresh play log.

## Out Of Scope For MVP

- automated promotion from turns into lore (manual edit is fine)
- multi-world index (one world per run is fine)
- hosted bible browser (read in editor for now)
- KBrain/GBrain/MCP-backed bible (Markdown is enough; that's a later seam)
