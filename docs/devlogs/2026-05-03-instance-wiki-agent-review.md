# Instance Wiki Architecture Agent Review

Date: 2026-05-03
Branch: `nightshift/instance-wiki-authoring-plan`
Base: `nightshift/visual-asset-pipeline-implementation`

## Prompt

Kyle asked to turn the template/instance discussion into a tangible implementation
plan and to get Codex and Claude involved again.

Key product decisions reviewed:

- gameplay agents should not access templates at all;
- deterministic setup materializes a world template and story template into instances;
- active world/story instances are the only gameplay source of truth;
- story log and world-instance canon must be separate;
- significant events become promotion candidates accepted by a DM/human;
- character-level knowledge must prevent NPC omniscience.

## Claude Code Read-Only Review

Claude recommended a contract + scaffolding PR, not a full runtime migration. Its
highest-signal points:

- keep current `worlds/*` and `scenarios/*` as transitional template roots;
- define `instances/<id>/` as the active source of truth;
- add materializer/loaders/context builders/promotion helpers in the next code PR;
- add hard path guards so instance loaders cannot read templates;
- add per-character filtered context so NPCs do not get the full wiki;
- do not migrate `parleyRuntime.js` in the planning PR.

## Codex Read-Only Review

Codex independently recommended a contract-locking + thin implementation PR. Its
highest-signal points:

- setup code may read templates, gameplay code may not;
- current visual asset code already depends on `worldDir`, so the next runtime PR
  must prove `worldDir` points at the active instance;
- promotion candidates should be pending artifacts, not canon;
- accepted promotions should update world instance canon with provenance;
- docs currently blur world template, world instance, and story log, so the docs
  need correction before implementation.

## Synthesis

The planning PR should lock language and artifacts first:

1. Template roots are seed material.
2. Instance roots are gameplay truth.
3. Story logs are immutable evidence.
4. Promotion candidates are pending governance artifacts.
5. DM/human acceptance writes world-instance canon.
6. Character agents receive filtered context, not the whole wiki.

Runtime migration should be the next stacked PR after this one.
