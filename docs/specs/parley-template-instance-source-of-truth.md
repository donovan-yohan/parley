# Parley Template / Instance Source-of-Truth Contract

> **STATUS:** Implemented in PRs #21-#25 (2026-05-04). See
> `docs/plans/2026-05-04-belayer-profile-coupling.md` for the as-shipped scope.

## Purpose

Parley separates reusable authored seed material from mutable gameplay history.
Templates are selected by deterministic setup code. Instances are the only source of
truth during play.

This avoids the failure mode where a gameplay agent has to choose between original
template canon and the player's evolved world state. During play, that conflict must
not exist in the agent's context.

## Terms

| Term | Meaning | Mutable during gameplay? | Read by gameplay agents? |
| --- | --- | ---: | ---: |
| World template | Reusable authored setting seed. Current transitional location: `worlds/<world-id>/`. | No | No |
| Story template | Reusable authored story/module seed. Current transitional location: `scenarios/<story-id>/scenario.json`. | No | No |
| World instance | Materialized copy/fork of a world template for one campaign, player group, or author workspace. | Yes, through controlled writes | Yes |
| Story instance | Materialized copy/fork of a story template mounted inside one world instance. | Yes, through controlled writes | Yes |
| Run | A player/session timeline inside a story instance. In the local prototype, this can be collapsed into the story instance. | Yes | Yes |

## Hard Rule

After instance materialization, gameplay code MUST resolve every read and write
through the active instance root. Gameplay agents MUST NOT read from template roots.

Allowed during setup:

```text
world template + story template
  -> deterministic materializer
  -> world instance + story instance
```

Allowed during gameplay:

```text
world instance + story instance + story log + verdicts
  -> GM / characters / truth authority
  -> instance-local writes only
```

Forbidden during gameplay:

```text
GM / character / truth authority
  -> worlds/<template-id>/...
  -> scenarios/<template-id>/scenario.json
  -> templates/<template-id>/...
```

Templates are authoring and distribution artifacts. Instances are living artifacts.

## Transitional Template Roots

The repository currently stores reusable seed material at:

```text
worlds/<world-id>/
scenarios/<scenario-id>/scenario.json
```

For the next implementation slice, these paths are treated as template inputs even
though they are not yet moved under a `templates/` directory. Avoid a large file move
until the runtime has an instance loader and tests around it.

Logical future shape:

```text
content/
  templates/
    worlds/<world-template-id>/
    stories/<story-template-id>/
  instances/
    worlds/<world-instance-id>/
```

## Instance Layout

Recommended file-backed local shape:

```text
instances/<world-instance-id>/
  instance.json

  world/
    WORLD.md
    SCHEMA.md
    index.md
    log.md
    art-style.md
    lore/
      locations/
      factions/
      rules/
      timeline/
      secrets/              # DM/validator only; not character context
    characters/
    assets/
      manifest.json
      portraits/
      backgrounds/
    canon/
      facts.jsonl
      timeline.md
      open-threads.jsonl
    state/
      world-state.json
      hidden-truth.jsonl    # never player/character visible

  stories/
    <story-instance-id>/
      instance.json
      STORY.md
      SCHEMA.md
      index.md
      scenes/
      beats/
      cast.md
      promotion-policy.md
      state/
        story-state.json
        turns.jsonl
        truth-verdicts.jsonl
        promotion-candidates.jsonl
        promotions.jsonl
```

The prototype can start with a single `story/` directory instead of `stories/<id>/`
if that keeps the first diff smaller. The contract should still name the story
instance because the product model supports many stories in one world instance.

## Materialization Contract

A deterministic materializer owns template reads. It should:

1. Resolve `worldTemplateId` and `storyTemplateId`.
2. Create a new world instance directory and story instance directory.
3. Copy selected template records into the instance.
4. Stamp `instance.json` with source template ids, source versions, source hashes,
   materialized timestamp, and schema versions.
5. Initialize empty/seeded instance state files.
6. Refuse to overwrite an existing instance id.
7. Never call an LLM, agent, image provider, or Belayer tool.

Example metadata:

```json
{
  "schema_version": "parley-instance/v1",
  "id": "kyle-last-lantern-first-rumor",
  "source": {
    "world_template": "last-lantern",
    "world_template_version": "0.1.0",
    "story_template": "last-lantern",
    "story_template_version": "0.1.0",
    "world_template_hash": "sha256:...",
    "story_template_hash": "sha256:..."
  },
  "paths": {
    "world": "world",
    "stories": "stories"
  },
  "materialized_at": "2026-05-03T00:00:00Z"
}
```

## Source-of-Truth Hierarchy During Play

Within one active instance:

1. World instance canon: `world/canon/*`, `world/lore/*`, `world/characters/*`,
   and `world/state/world-state.json`.
2. Story instance state: active beats, active scene, story-local memory.
3. Story log: immutable `turns.jsonl` evidence.
4. Truth verdicts: semantic review trail.
5. Promotion candidates: proposed changes, not canon.
6. Agent drafts: never source of truth until accepted by strict code/DM.

Templates are not in the runtime hierarchy.

## Path Isolation Requirement

Instance loaders should reject any resolved path outside the active instance root.
This is not primarily a security feature in the local prototype. It is a product
correctness feature: a gameplay agent should be structurally unable to peek at or
mutate templates.

Minimum tests:

- deleting template roots after materialization does not break instance loaders;
- path traversal such as `../worlds/last-lantern/WORLD.md` is rejected;
- gameplay context output contains no template paths;
- visual asset prompts/manifests are written under the instance world, not template world.

## What Belongs Where

| Question | Template | Instance |
| --- | --- | --- |
| What options can a user start from? | Yes | No |
| What happened in this campaign? | No | Yes |
| What is reusable across fresh starts? | Yes | No |
| What has this player changed? | No | Yes |
| What should a character know right now? | Seed guidance | Instance-filtered context |
| What can become publishable later? | Explicit authoring/export workflow | Source material for export |

## Publishing Back To Templates

Exporting an evolved instance into a new template version is an authoring workflow,
not gameplay. It requires explicit user action and should produce a reviewable diff.

Do not silently mutate templates because a gameplay event was important.
