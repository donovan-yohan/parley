# Parley Framework Architecture

This document is a review map for what Parley is doing, how it uses Belayer, where player input enters the system, and where a story author or future LLM author contributes content.

## One-sentence model

Parley is a story runtime layered on Belayer: the player gives freeform intent, a turn author drafts narration and proposed state changes, a truth authority decides what becomes durable story memory, and Belayer provides the generic generated-talent substrate for reusable characters.

## Current proof slice

The current local slice proves:

- one browser UI can run multiple worlds/scenarios;
- player input flows through a single `runPlayerTurn` path;
- deterministic scenario packs are data fixtures, not custom frontend branches;
- every NPC is persisted as a reusable Parley character backed by a Belayer generated-talent record;
- story memory is structured into canon, rumors, leads, beliefs, and unresolved threads;
- loose authoring is separated from strict continuity/persistence.

## System map

```mermaid
flowchart LR
  Player["Player"] -->|freeform action| UI["Parley Web UI\nsrc/client"]
  UI -->|GET /api/scenarios| Server["Parley Local Server\nsrc/server.js"]
  UI -->|GET /api/state?scenario=id| Server
  UI -->|POST /api/turn\nscenarioId + playerAction| Server

  Server --> Runtime["Parley Story Runtime\nrunPlayerTurn"]

  Runtime --> ScenarioLoader["Scenario Pack Loader\nsrc/runtime/scenarioPacks.js"]
  ScenarioLoader --> ScenarioPack["Scenario Pack JSON\nscenarios/<id>/scenario.json"]

  Runtime --> CharacterAdapter["Belayer Character Adapter\nsrc/runtime/belayerCharacterAdapter.js"]
  CharacterAdapter --> BelayerTalent["Belayer Generated Talent Shape\ngeneric character substrate"]

  Runtime --> TurnAuthor["Turn Author Seam\nsrc/runtime/turnAuthor.js"]
  TurnAuthor --> FixtureAuthor["Current Fixture Author\nmatchAny deterministic routing"]
  TurnAuthor -. future .-> LLMAuthor["Future LLM / Story Author\nfuzzy intent + prose + facts"]

  Runtime --> TruthAuthority["Truth Authority\nsrc/runtime/truthAuthority.js"]
  TruthAuthority --> WorldContract["Strict World Contract\nallowed canon + fact categories"]

  Runtime --> Artifacts["Durable Artifacts\nworld-state.json\nturns.jsonl\ntruth-verdicts.jsonl\ncharacter markdown"]
  Artifacts --> UI
```

## Boundary between Parley and Belayer

Belayer should stay generic. Parley should stay story-aware.

```mermaid
flowchart TB
  subgraph Belayer["Belayer responsibilities"]
    Crags["crags / climbs"]
    Talent["generated talent records"]
    Control["agent spawn, roster, mail, events, artifacts"]
    Gates["generic gates and completion flow"]
  end

  subgraph Parley["Parley responsibilities"]
    Worlds["worlds + scenario packs"]
    Scenes["scenes + turns"]
    Characters["story-facing characters"]
    Lore["lore, rumors, leads, mysteries"]
    Truth["truth verdicts + continuity"]
    UI["text RPG UI / UX"]
    Assets["art style + portrait metadata"]
  end

  Characters -->|mapped onto| Talent
  Parley -. does not make .-> Belayer
```

### Practical meaning

- Belayer sees reusable generic talent records.
- Parley decides that a talent is `Mara Underbough`, a tavernkeep with a knowledge boundary and future callback potential.
- Belayer should not learn concepts like canon, rumor, mystery, or hidden truth.
- Parley should not reimplement generic agent orchestration if Belayer already owns it.

## Turn lifecycle

```mermaid
sequenceDiagram
  autonumber
  participant P as Player
  participant UI as Parley Web UI
  participant API as Local Server
  participant RT as Parley Runtime
  participant SP as Scenario Pack
  participant BA as Belayer Adapter
  participant TA as Turn Author
  participant TV as Truth Authority
  participant FS as File-backed Artifacts

  P->>UI: Types player action
  UI->>API: POST /api/turn { scenarioId, playerAction }
  API->>RT: runPlayerTurn(...)
  RT->>SP: Load scenario, scene, characters, proposed fact contract
  RT->>FS: Read previous world-state.json
  RT->>BA: Build reusable character records
  BA-->>RT: Parley character + Belayer generated talent mapping
  RT->>FS: Persist character markdown if missing
  RT->>TA: authorTurn(context)
  TA-->>RT: narration, nextChoices, proposedFacts
  RT->>RT: Normalize authored turn and facts
  RT->>TV: judge turn against strict world contract
  TV-->>RT: pass or revise + fact buckets

  alt verdict pass
    RT->>FS: Append turns.jsonl
    RT->>FS: Append truth-verdicts.jsonl
    RT->>FS: Merge world-state.json
    RT-->>API: committed turn + worldState
    API-->>UI: narration + choices + story memory
  else verdict revise
    RT->>FS: Append truth-verdicts.jsonl only
    RT-->>API: uncommitted turn + rejection reasons
    API-->>UI: safe response without committing canon
  end
```

## Inputs: player vs story author

```mermaid
flowchart LR
  subgraph PlayerInput["Player input"]
    Freeform["Freeform action\n'I ask who remembers the old north road.'"]
    ScenarioSelect["Scenario selection\nlast-lantern / neon-afterhours / orchard-welcome"]
  end

  subgraph StoryAuthorInput["Story author input"]
    ScenarioJson["scenario.json\nworld, scene, theme, opening"]
    Characters["character definitions\nrole, tags, faction, knowledgeBoundary"]
    ResponseFixtures["current fixture responses\nmatchAny, narration, nextChoices"]
    FactContract["proposed fact contract\ncanon, rumor, lead, belief, unresolved"]
    HiddenTruth["author-only hidden truth boundary\nfuture seam"]
  end

  subgraph RuntimeInput["Runtime-generated input"]
    TurnId["turnId"]
    PreviousState["previousWorldState"]
    CharacterRecords["reusable character records"]
  end

  PlayerInput --> TurnAuthor["Turn Author"]
  StoryAuthorInput --> TurnAuthor
  RuntimeInput --> TurnAuthor
  StoryAuthorInput --> TruthAuthority["Truth Authority"]
  TurnAuthor --> TruthAuthority
```

### Player input

The player supplies intent, not canon. In the current app, this is the text input posted to `/api/turn` as `playerAction`.

Examples:

```text
I ask who remembers the old north road.
I ask Kestrel-9 where the missing maintenance order was routed.
I lie and say June already confessed.
```

### Story author input

The story author supplies the world contract and optional fixture beats. Today that lives in `scenarios/<scenario-id>/scenario.json`:

- world identity and tone;
- scene identity;
- opening narration;
- suggested player intents;
- reusable character definitions;
- deterministic response fixtures for the proof slice;
- proposed facts, scoped by response ID.

In the future, the deterministic response fixture section should shrink or disappear. The author should mostly define world contract, character boundaries, hidden truths, scenario constraints, and eval expectations. The LLM-style turn author should draft the moment-to-moment prose.

## The strict / loose split

```mermaid
flowchart TB
  subgraph Loose["Loose authoring: swappable"]
    Intent["interpret player intent"]
    Draft["draft narration"]
    Choices["suggest next choices"]
    Propose["propose facts / state deltas"]
  end

  subgraph Strict["Strict continuity: durable"]
    Normalize["normalize authored turn"]
    ValidateFacts["validate fact schema"]
    TruthReview["truth authority verdict"]
    CanonGate["canon must match world contract"]
    Persist["persist turns, truth verdicts, world state"]
  end

  Loose --> Normalize --> ValidateFacts --> TruthReview --> CanonGate --> Persist
```

### Loose side

The loose side is allowed to be creative. It can be deterministic today and LLM-authored later.

Current implementation:

- `createScenarioFixtureAuthor()` selects a deterministic response with `matchAny`.
- This exists to make demo packs runnable and repeatable.

Future implementation:

- classify player intent fuzzily;
- draft new narration;
- extract proposed facts from the draft;
- suggest next actions based on current world state;
- respect character knowledge boundaries and hidden truth boundaries.

### Strict side

The strict side is not allowed to be vibes.

Current implementation:

- `normalizeAuthoredTurn()` validates author output shape;
- `evidence_turn` is assigned by runtime, not trusted from the author;
- `judgeTurn()` rejects unsupported canon;
- accepted canon is materialized from the scenario contract, not author-supplied payload;
- `buildWorldState()` merges durable categories cumulatively.

This is the split that keeps Parley from becoming a prompt-template toy.

## Story memory and persistence

```mermaid
flowchart LR
  TruthVerdict["Truth Verdict"] --> Canon["canon"]
  TruthVerdict --> Rumors["rumors"]
  TruthVerdict --> Leads["leads"]
  TruthVerdict --> Beliefs["character beliefs"]
  TruthVerdict --> Unresolved["unresolved threads"]
  TruthVerdict --> Rejected["rejected claims"]

  Canon --> WorldState["world-state.json"]
  Rumors --> WorldState
  Leads --> WorldState
  Beliefs --> WorldState
  Unresolved --> WorldState

  Rejected --> TruthLog["truth-verdicts.jsonl"]
  WorldState --> StoryMemory["Story Memory UI panel"]
```

Persisted artifacts:

```text
worlds/<world-id>/
  characters/<character-id>.md
  state/
    world-state.json
    turns.jsonl
    truth-verdicts.jsonl
```

The UI should display Story Memory from cumulative `world-state.json`, not from the latest turn alone. That distinction matters because off-script turns must not erase earlier discoveries.

## Current implementation files

| Concern | File(s) | Notes |
| --- | --- | --- |
| Browser UI | `src/client/index.html`, `src/client/app.js`, `src/client/styles.css` | Local Twine-inspired prototype UI. |
| HTTP API | `src/server.js` | Serves static UI plus `/api/scenarios`, `/api/state`, `/api/turn`. |
| Runtime loop | `src/runtime/parleyRuntime.js` | Owns turn lifecycle, persistence, and strict/loose handoff. |
| Scenario packs | `src/runtime/scenarioPacks.js`, `scenarios/*/scenario.json` | Data-driven worlds and current fixture beats. |
| Turn author seam | `src/runtime/turnAuthor.js` | Current deterministic fixture author; future LLM author plugs in here. |
| Belayer mapping | `src/runtime/belayerCharacterAdapter.js` | Maps Parley character definitions to Belayer generated-talent shape. |
| Truth authority | `src/runtime/truthAuthority.js` | Mock continuity editor and strict canon gate. |
| Evidence docs | `docs/demo/2026-05-02-human-scenario-playtest.md` | Actual browser-level human playtest logs. |

## What a story author should edit

For the current proof slice, a story author edits scenario pack data:

```text
scenarios/<scenario-id>/scenario.json
```

They should define:

- world premise and tone;
- scene title and opening situation;
- recurring NPCs and knowledge boundaries;
- suggested initial player intents;
- hidden truths or boundaries, when supported;
- fact contract categories: canon, rumor, lead, belief, unresolved;
- optional deterministic fixture responses for demos/tests.

They should not edit:

- frontend branches per world;
- runtime code per scenario;
- Belayer internals for story-specific concepts;
- persisted state artifacts by hand except for debugging.

## What the player experiences

```mermaid
journey
  title Player journey through one Parley turn
  section Choose context
    Select scenario: 4: Player
    Read opening narration: 4: Player
  section Act
    Type freeform intent: 5: Player
    Submit turn: 5: Player
  section Receive response
    Read narration: 5: Player
    Review next choices: 4: Player
    Notice reusable NPCs: 4: Player
    Inspect Story Memory: 5: Player
  section Continue
    Follow a lead or go off-script: 5: Player
```

The player should feel like they are talking to a living story, but the system should be able to explain what changed in state after each turn.

## Near-term open architecture questions

1. **Story author format:** Should scenario packs stay raw JSON, or move to a friendlier authoring format with generated JSON artifacts?
2. **Canon promotion:** What is the explicit workflow for promoting newly discovered/emergent facts into the world contract?
3. **LLM author contract:** Should the future author return one structured object, or should prose drafting and fact extraction be separate calls?
4. **Truth authority strength:** Should the truth authority be a second model, deterministic schema validator, or hybrid reviewer?
5. **Belayer integration depth:** At what point do reusable characters become actual Belayer-managed agents instead of local generated-talent records?
6. **UI migration timing:** Keep vanilla UI until layout/jobs are proven; migrate only when the interaction model stabilizes.

## Review checklist

Use this doc to review whether the architecture has the right boundaries:

- [ ] Story concepts remain in Parley, not Belayer.
- [ ] Belayer remains a generic generated-talent/control-plane substrate.
- [ ] Player input is treated as intent, not truth.
- [ ] Story author input defines world contract and boundaries.
- [ ] Loose authoring can be swapped later without rewriting persistence/UI.
- [ ] Strict truth review gates durable canon.
- [ ] Story Memory is inspectable, cumulative, and not just prose.
- [ ] Demo fixtures do not become the long-term storytelling contract.
