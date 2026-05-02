# Last Lantern — Schema Commitments

This world commits to the following Parley contract versions. The runtime
loader must support all of them or fail fast.

## Required Contracts

- `parley-world/v1` — `WORLD.md` frontmatter and root layout
- `parley-character/v1` — `characters/<id>.md`
- `parley-scene/v1` — `scenes/<id>.yaml`
- `parley-turn/v1` — `state/turns.jsonl` entries
- `parley-world-state/v1` — `state/world-state.json`
- `parley-truth-verdict/v1` — `state/truth-verdicts.jsonl` entries
- `parley-art-style/v1` — `art-style.md` frontmatter

## Truth Authority Guidance

Per-world hints for the truth authority. The deterministic MVP authority can
ignore these; an LLM-backed authority should weigh them.

- promote to canon only if the claim is supported by:
  - a scene seed line
  - a character `knowledge_scope.knows` entry
  - a prior committed turn
- treat any claim about the north stones as `rumor` unless a scene seed
  explicitly upgrades it
- the Ashford name is `mystery`-tier — no canon claims about Ashford lineage
  may be committed without an explicit author override
- characters may not invent other reusable characters by name (must go
  through a `talent-request` flow)

## Forbidden Topics

These categories are author-only. Any claim that touches them must route to
`hidden-truth.jsonl`, not to player-visible state:

- the actual nature of the north stones
- Ashford lineage truth
- the keeper's burn-scar origin

## Tone Enforcement

If a verdict catches a contribution that breaks tone (heroic boasting,
wisecracking bard voice, modern slang), demote to `revise` and require
rewrite. Tone violations are not just style — they break the world.
