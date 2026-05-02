# Parley Night Shift MVP — Twine-Style Vertical Slice

## Goal

Build Parley from a static Belayer smoke into a small playable text-driven web experience.

The MVP should prove this loop:

1. A player opens a simple Twine-inspired HTML interface.
2. The player types a freeform action into the scene.
3. A game-master layer interprets the action against the current scene/world state.
4. If a character is needed, Parley uses Belayer generated talent as the character framework.
5. Every NPC becomes reusable by default and gets tags/metadata for future callbacks.
6. A second LLM-style authority judges what is true for the story before state is committed.
7. The UI shows the reply and next choices.
8. Artifacts persist enough state to replay, inspect, and extend the world.

This should stay exploratory, but not mushy. Build one tiny vertical slice first, then expand.

## Product Direction

Parley is a multi-agent storytelling framework where:

- Belayer provides the generic runtime/control-plane mechanics.
- Parley implements story concepts on top of Belayer.
- Belayer `talents` are Parley's character substrate.
- A generated talent is not disposable NPC slop; it is a reusable character record.
- A GM controls scene flow, but a separate truth/continuity authority decides what becomes established state.
- The UI starts as a simple text-driven HTML experience inspired by Twine/interactive fiction.
- Later, characters can have portraits generated through Hermes image-generation tooling using world-defined art direction.

## Non-Goals For This Night Shift

Do not build the whole engine.

Out of scope for the first vertical slice:

- multiplayer
- accounts/auth
- hosted deployment
- combat/rules engine
- inventory/economy
- full Honcho integration
- full LLM Wiki automation
- polished portrait pipeline
- marketplace/community worlds
- real-time streaming unless it falls out naturally

## MVP Architecture

### UI Layer

Start with a tiny local web app.

Requirements:

- Displays scene transcript like interactive fiction.
- Has a text input for player action.
- Shows GM/narrator replies.
- Shows current known NPCs in a side panel or simple list.
- Shows next choices when present.
- Can run locally with one command.

Implementation can be vanilla JS, Vite, Next, Svelte, whatever is fastest and least stupid. Prefer boring.

### Parley Story Runtime

Owns Parley schema and state:

- `parley-scene/v1`
- `parley-turn/v1`
- `parley-character/v1`
- `parley-world-state/v1`
- `parley-truth-verdict/v1`

Runtime responsibilities:

- load a world/scene seed
- accept a player turn
- select or create characters
- call into Belayer-compatible character/talent persistence
- produce narration
- ask truth authority for verdict
- commit accepted state deltas
- return response payload to UI

First pass can be deterministic/mock-LLM enough to prove the loop, but it should have clear seams for real LLM calls.

### Belayer Character Adapter

Parley character creation maps to Belayer generated talent.

Rules:

- every generated NPC is reusable by default
- default lifecycle: `resumable`
- character id should be stable slug, e.g. `mara-underbough`
- tags are first-class: location, role, importance, faction, scene, tone
- character record references source request / turn id
- character record may reference portrait asset path later

Parley should not make Belayer story-aware. Belayer stores generic generated talent; Parley keeps story-facing character metadata and world usage rules.

### Truth Authority

A second LLM-style authority decides what is true for the story.

MVP version can be a separate module with a mock/deterministic verdict, but it must model the contract:

Input:

- prior world state
- scene seed
- player action
- GM narration
- character contributions
- proposed state delta

Output:

- pass/fail/revise verdict
- accepted facts
- rejected claims
- uncertainty/rumor flags
- evidence artifact paths

The authority should distinguish:

- established canon
- character belief
- rumor
- unresolved mystery
- author-only hidden truth

### World Bible / Library Seed

Create a starter world-library shape but keep it file-backed.

Proposed layout:

```text
worlds/last-lantern/
  WORLD.md
  SCHEMA.md
  index.md
  log.md
  art-style.md
  lore/
    locations/last-lantern-tavern.md
    factions/
    rumors/
  characters/
    mara-underbough.md
  scenes/
    tavern-first-rumor.yaml
  state/
    world-state.json
    turns.jsonl
    truth-verdicts.jsonl
  assets/
    portraits/
```

This is the LLM Wiki/Obsidian-compatible layer. It should be human-readable and agent-readable.

MVP should create the layout and maybe one or two files, not solve a whole wiki manager.

### Portrait / Image Generation Seam

Do not generate images in the first coding slice unless trivial. Do define the metadata and seam.

Character portrait prompt should combine:

- world art style prompt from `art-style.md`
- character visual traits
- role/location tags
- mood/tone
- negative prompt / consistency notes if supported

Persist later as:

```text
worlds/last-lantern/assets/portraits/mara-underbough.png
```

Character metadata should include:

```yaml
portrait:
  status: missing | generated | locked
  prompt_path: ...
  asset_path: ...
```

## Suggested Agent Split

### Codex Strengths

Use Codex for concrete implementation:

- scaffold local web app / API
- define schemas/types
- implement file-backed runtime
- write smoke tests
- fix CLI/script drift

### Claude Strengths

Use Claude for product architecture and coherence:

- refine story runtime contracts
- design world bible layout
- review UX flow
- design truth-authority contract
- adversarially review scope creep

## First Implementation Tasks

### Task A — Fix Belayer Smoke Drift

The current `scripts/smoke-last-lantern.sh` assumes installed Belayer has `crag` and tab-delimited generated talent output. Latest source has those commands, but local installed `belayer` is old and output spacing differs.

Fix the smoke so it:

- fails with a clear message if Belayer lacks `crag`
- accepts whitespace-separated generated talent output
- prefers `team generated` but supports existing aliases if available
- documents required Belayer version/source

### Task B — Add Parley Runtime Skeleton

Implement minimal file-backed runtime under a boring stack.

Expected capabilities:

- load Last Lantern world/scene seed
- accept player action
- produce response payload
- ensure Mara exists as reusable character/talent metadata
- write turn artifact/state file
- call truth-authority module before committing facts

### Task C — Add Twine-Style UI

Implement a tiny local UI:

- transcript column
- player input
- submit button / enter key
- next choices
- known reusable NPC list
- simple styling evocative of interactive fiction

### Task D — Add World Bible Seed

Create `worlds/last-lantern/` with LLM Wiki-ish files:

- `WORLD.md`
- `SCHEMA.md`
- `index.md`
- `log.md`
- `art-style.md`
- one location page
- one character page for Mara after creation or as seeded example

### Task E — Define Portrait Seam

Add character metadata and docs for portrait generation, but do not require real image generation for MVP tests.

## Verification

The slice is real when:

1. One command starts the local app.
2. User types: `I ask who remembers the old north road.`
3. UI responds with narration involving Mara Underbough.
4. Mara appears in reusable NPC list with tags.
5. State files are updated.
6. Truth verdict artifact exists and gates committed canon.
7. Smoke tests pass.
8. The implementation does not require Belayer to understand story-specific nouns.

## Open Questions To Explore After Slice

- Should Honcho store character beliefs/relationships, or should we use a graph/file-backed layer first?
- Should the world bible be plain Markdown, KBrain/GBrain, or agentmemory-style MCP?
- How should the GM retrieve relevant NPCs as the world grows?
- How do we distinguish callbacks that are fun from callbacks that create forced nostalgia sludge?
- What is the minimum rules chassis for stakes without combat crunch?
- How do portraits stay visually consistent over many generated characters?
