# Last Lantern Live Storyteller Flow

## Goal

Prove Parley can drive a small interactive story scene through Belayer without
making Belayer story-aware.

The demo should start from a player entering the Last Lantern Tavern, let a
storyteller/game-master agent decide that a tavernkeep is needed, create that
generated talent through Belayer's generic tooling, spawn it as a normal Belayer
agent, collect scene/world artifacts, and close only after a continuity gate
accepts the result.

## Boundary

Parley owns:

- player-facing story terms such as scene, tavern, tavernkeep, rumor, and world
  state
- prompts for game-master, narrator, NPC, and continuity behavior
- artifact content and scene acceptance criteria
- deciding when a generated character should become reusable

Belayer owns only mechanical coordination:

- crag link and generated-talent record storage
- project-local `.belayer/agents/<id>/` identity scaffolding
- agent spawn, roster, mail, events, and artifact registration
- completion/gate orchestration over generic artifact kinds and natural-language
  conditions

## Initial Scene

Use `examples/last-lantern/scene.yaml` as the first scene seed.

Player input:

> I step inside the Last Lantern Tavern and ask who still remembers the old
> north road.

The storyteller starts as the scene coordinator. It can read the scene seed and
the existing static artifacts, but the live run must produce fresh run artifacts
instead of relying only on checked-in examples.

## Required Live Flow

1. Start a Belayer session with Parley as the workspace and `last-lantern` as the
   linked crag context.
2. Spawn or start the storyteller/game-master identity with permission to use:
   - `belayer_create_artifact`
   - `belayer_scaffold_generated_talent`
   - `belayer_spawn_agent`
   - completion/gate request tooling
3. The storyteller creates an `org-plan` artifact for the scene. The plan must
   include:
   - the player-facing premise
   - a tavernkeep talent request
   - expected artifacts
   - at least one acceptance gate
4. The storyteller calls `belayer_scaffold_generated_talent` for
   `mara-underbough` with generic fields:
   - `domain: story`
   - `role: tavernkeep`
   - `lifecycle: resumable`
   - `source_request: turn-0002`
   - compact metadata such as voice and knowledge boundaries
5. The storyteller calls `belayer_spawn_agent` using
   `identity: mara-underbough`.
6. The tavernkeep contributes bounded scene material. It should answer only from
   its provided assignment context and avoid inventing hidden author-only truth.
7. The storyteller integrates the tavernkeep response into player-facing
   narration and registers a scene transcript or turn artifact.
8. A lore/world-state step records only durable facts established by artifacts.
   This can be performed by the storyteller for the first slice or by a separate
   lorekeeper talent once that is useful.
9. A continuity gate evaluates the run against the scene acceptance conditions
   and registers a `gate-result`.
10. The run may complete only after the gate result is accepted or explicitly
    records why human review is needed.

## Required Artifacts

The live run must register these artifact classes, even if the first version
uses compact JSON or Markdown:

- `org-plan`: scene plan, talent request, expected outputs, gates
- `generated-talent`: the generated tavernkeep record or scaffold evidence
- `story-turns`: player input, storyteller narration, tavernkeep contribution
- `world-state`: durable facts established by this scene
- `gate-result`: continuity verdict with evidence references

## Acceptance Gate

The demo gate is continuity. It passes only if:

- the player receives a meaningful next choice
- the tavernkeep response is consistent with the scene seed and generated
  metadata
- the world-state artifact records established facts only
- every reusable generated-talent claim links back to the source request or
  evidence artifact
- no Belayer artifact or tool contract depends on story-specific field names

## Out Of Scope For The First Slice

- a full rules engine
- combat, dice, inventory, or character sheets
- permanent promotion of generated talent into a curated catalog
- long-term memory beyond the generated record, Hermes session id, and
  registered world-state artifact
- UI rendering beyond logs/artifacts

## Smoke Command Shape

The eventual automated smoke should look like this:

```bash
BELAYER_BIN=/path/to/belayer ./scripts/smoke-last-lantern-live.sh
```

The script should use a temporary `BELAYER_HOME` and a temporary run workspace
unless explicitly told to update the local checkout. It should fail if the live
run does not produce the required artifacts, scaffold `mara-underbough`, spawn it
as `kind=side`, and register a passing continuity gate result.
