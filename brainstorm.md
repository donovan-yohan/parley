# parley — initial brainstorm

## working framing

Parley is a multi-agent storytelling / roleplaying framework built on top of Belayer + Hermes.

The core idea is not just “AI dungeon master,” but a system where:
- a DM / orchestrator can run scenes
- a party of agent characters can think, speak, and act
- NPCs can be spawned on demand
- agents can communicate through Belayer
- memory is split cleanly across canon, perspective, and immediate runtime state
- creators can build, remix, and share worlds and stories across genres

Current working name: **Parley**.

---

## high-level goal

Build a framework for collaborative, multi-agent storytelling that can support:
- seeded worlds and lore
- scenario and campaign scaffolding
- text-RPG style player interaction
- community-authored worlds
- community-authored stories within those worlds
- setting-agnostic play (fantasy, cyberpunk, sci-fi, western, etc.)

The desired end state is not one fixed campaign. It is a **framework for worlds, stories, and live play**.

---

## core product shape

### 1. world layer
Stable lore and canon for a setting.

Examples:
- geography
- factions
- species / cultures
- history / timeline
- gods / cosmology
- technology / magic rules
- tone and genre constraints

### 2. story layer
Authored or generated campaign structure inside a world.

Examples:
- scenarios
- quests
- arcs
- encounter chains
- world events
- authored “happy path” narratives

This is the layer that guides players through meaningful experiences without requiring the whole system to solve infinite improvisation on day one.

### 3. session layer
Immediate player actions and current play state.

Examples:
- current scene
- party composition
- inventory
- health / conditions / resources
- active quest state
- current NPC presence
- recent actions and consequences

---

## important memory split

A big architecture point from the discussion: do **not** let all memory collapse into one mushy store.

### canon / lore memory
Use an Obsidian vault with Karpathy-style LLM Wiki conventions as the world bible.

Good for:
- official lore
- scenario scaffolds
- world state summaries
- campaign/session summaries promoted into canon
- creator-readable and agent-readable documentation

### perspective / character memory
Use Honcho for what characters know, believe, suspect, and remember about each other.

Good for:
- relationship drift
- trust / fear / grudges / alliances
- what Bob knows that Charlie does not
- recurring NPC/player models
- peer-based social memory

### runtime state
Use a separate structured state store for the immediate simulation.

Good for:
- combat / turn state
- room state
- quest flags
- temporary conditions
- item possession
- deterministic current session facts

### key rule
**wiki stores canon**
**honcho stores perspective**
**runtime store holds current state**

If those boundaries get blurry, the whole thing turns into agent soup.

---

## why belayer matters here

Belayer is one of the strongest ingredients because it already gives us a clean mechanism for agent-to-agent communication.

Potential role of Belayer in Parley:
- DM sends instructions to specialists / characters / NPCs
- NPCs can message each other or report back through the control plane
- party members can speak as distinct agents instead of a single blob prompt
- spawned characters can be scoped to scenes or long-lived roles
- artifacts can be used for scene briefs, reports, or lore updates

This suggests a clean stack:
- **Belayer** = communication / orchestration plane
- **Hermes** = agent runtime, identity, skills, delegation
- **Honcho** = subjective character memory
- **LLM Wiki + Obsidian** = canon / lore bible
- **runtime state store** = immediate simulation state

---

## DM / party / NPC architecture idea

### DM / orchestrator
Responsibilities:
- scene framing
- adjudication
- deciding what NPCs need to exist
- promoting events into canon
- deciding what becomes truth vs rumor vs misunderstanding

### party agents
Responsibilities:
- maintain distinct voice / personality / goals
- reason from limited knowledge
- respond to player choices
- coordinate with each other through messages, not merged omniscience

### NPC agents
Responsibilities:
- embody local perspective
- respond based on social position and limited information
- persist if important, disappear if disposable

### curator / canonizer step
Important design idea:
- not every character utterance becomes canon
- transcripts and runtime events may produce updates
- a curator step decides what enters the lore bible

This is crucial for avoiding canon rot.

---

## worldbuilding goals

The system should support both:
1. **seeded worlds** created intentionally by authors
2. **tools to build worlds** collaboratively with agents

Potential capabilities:
- generate world seeds
- scaffold factions / cities / cultures / conflicts
- build scenario templates from world context
- generate rumors, legends, and secrets
- create NPC rosters tied to locations and factions
- create campaign hooks from unresolved tensions in the setting

---

## product philosophy

We probably do **not** want to start with “infinite sandbox, do anything.”
That sounds cool and usually produces sludge.

A saner v1 is:
- large pre-seeded context
- authored scenario scaffolds
- guided story paths with room for roleplay and deviation
- strong world/story/session separation
- clear perspective boundaries

In other words: enough freedom to feel alive, enough structure to avoid collapse.

---

## genre / rules flexibility

The framework should not be hard-bound to a single setting.

Desired support:
- fantasy
- cyberpunk
- space opera / sci-fi
- western
- horror
- hybrid settings

This argues for:
- setting-neutral architecture
- pluggable world bibles
- pluggable rules chassis

### rules chassis thoughts
Options discussed:
- **D&D 5e / SRD 5.2.1** for familiarity and onboarding
- lighter systems for easier agent play
- possibly something more narrative and genre-flexible than full 5e

Important note:
- 5e is recognizable, but may be too heavy if used in full detail
- a lighter or simplified chassis may be better for multi-agent playability

Potential direction:
- start “5e-ish” for accessibility
- simplify where needed
- eventually support multiple rules packs

---

## community-driven long-term vision

Long-term, Parley could support:
- many distinct worlds
- many stories inside each world
- reusable scenario packs
- creator-authored lore bibles
- player-facing text RPG sessions
- shareable campaign/session outputs
- remixable community content

Possible ecosystem pieces:
- world packs
- campaign packs
- NPC packs
- rules packs
- memory presets
- style / tone packs

---

## inspiration references

### dougdoug multi-agent D&D stream / repo
Useful as inspiration for:
- multi-character banter
- entertaining AI roleplay
- visible character differentiation
- audience-friendly chaos

But likely insufficient as architecture for this project because it does not appear designed around:
- durable canon
- perspective-bounded memory
- long-lived world state
- reusable world/story framework

### honcho
Most promising for:
- “what characters know about each other”
- peer memory
- observed vs unobserved state
- relationship and belief modeling

### karpathy LLM Wiki / Obsidian
Most promising for:
- lore bible
- campaign wiki
- persistent structured notes
- human-readable and agent-maintainable knowledge base

---

## naming notes from this thread

Names discussed included:
- partyline
- storymesh
- mycelium
- wayfinder
- campfire
- chorus
- lantern
- loom
- relay
- embershard
- blackquill
- hollowscript
- morrowtale
- ghostlight
- redthread
- manyvoices
- fireside protocol
- parley
- vellum
- castline
- scenegraph
- dramatis

Current favorite / selected placeholder: **Parley**.

Why it seems strong:
- implies communication
- fits agent-to-agent interaction
- has roleplay flavor without locking to fantasy
- works for DM / party / NPC dynamics
- short and memorable

---

## initial thesis sentence

Parley is a multi-agent storytelling framework where Belayer handles the voices, Hermes runs the identities, Honcho tracks perspective, a wiki stores canon, and a structured runtime engine keeps the world playable.

---

## open questions

### architecture
- what is the minimal runtime state model for v1?
- how do we represent scene state vs campaign state vs world state?
- what artifacts should Belayer mediate during play?
- when should NPCs be long-lived peers vs ephemeral scene agents?

### memory
- what exactly gets written to Honcho?
- what exactly gets promoted into wiki canon?
- what should remain only in event logs?
- how do we model rumor vs truth vs personal belief?

### gameplay
- should v1 be solo player + AI party, or AI party observed by player?
- how much deterministic game logic is necessary for v1?
- how crunchy should the rules be?
- do we support combat first, or social exploration first?

### authoring
- what does a “world pack” look like?
- what does a “story pack” look like?
- what tools are needed to scaffold worlds and scenarios?
- what should creators hand-author vs generate?

### UX
- text-only first?
- terminal/chat-native first?
- web UI later?
- how visible should agent-to-agent communication be to the player?

---

## rough v1 idea

A practical first version could be:
- one authored world
- one authored scenario arc
- one DM/orchestrator
- 2–4 party agents
- spawned NPCs for scenes
- text chat interface
- wiki-backed lore and scenario docs
- structured runtime state
- optional Honcho memory for recurring characters

That would be enough to prove:
- distinct character voices
- perspective-aware play
- DM orchestration
- playable scene flow
- world/story/session separation

without trying to solve the whole metaverse on day one.
