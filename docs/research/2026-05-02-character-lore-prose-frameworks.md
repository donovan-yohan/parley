# Character, Lore Bible, and Prose Frameworks — 2026-05-02

## TL;DR

Parley should not prompt “write a story.”

It should define:

- world canon,
- character identity and voice,
- character knowledge boundaries,
- current scene pressure,
- memory/state deltas,
- prose quality gates,
- hidden truth visibility.

Then story should emerge from player action + character wants + world constraints.

If we hardcode story, we are building a choose-your-own-adventure generator with extra steps. if we define lore and characters well, the story can actually breathe.

## Sources researched

### SillyTavern

- https://docs.sillytavern.app/usage/characters/
- https://docs.sillytavern.app/usage/core-concepts/characterdesign/
- https://docs.sillytavern.app/usage/prompts/
- https://docs.sillytavern.app/usage/prompts/prompt-manager/
- https://docs.sillytavern.app/usage/core-concepts/worldinfo/
- https://docs.sillytavern.app/usage/core-concepts/authors-note/
- https://docs.sillytavern.app/usage/core-concepts/data-bank/
- https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md

### AI Dungeon / NovelAI / RP tooling

- https://help.aidungeon.com/faq/story-cards
- https://help.aidungeon.com/about-worlds-world-info-scenarios-and-story-cards
- https://docs.novelai.net/en/text/editor/storysettings/
- https://docs.novelai.net/en/text/lorebook/
- https://docs.novelai.net/en/text/textadventure/
- https://backyard.ai/docs/creating-characters/advanced-tips
- https://agnai.guide/docs/vocabulary/
- https://www.hammerai.com/blog/building-deep-ai-characters
- https://www.heywaii.com/en/blog/hw-ai-character-lorebooks-better-memory

### Agent/research references

- https://arxiv.org/abs/2304.03442
- https://arxiv.org/html/2406.17962v7
- https://arxiv.org/html/2508.02016v1
- https://arxiv.org/html/2502.03821v1

### Human writing craft

- https://www.advancedfictionwriting.com/articles/writing-the-perfect-scene/
- https://writershelpingwriters.net/2015/01/writing-patterns-fiction-scene-sequel/
- https://www.septembercfawkes.com/2022/01/writing-motivation-reaction-units-mrus.html
- https://www.unr.edu/writing-speaking-center/writing-speaking-resources/psychic-distance-in-creative-writing
- https://www.rabbitwitharedpen.com/blog/writing-dialogue-tags-action-beats-punctuation
- https://www.dabblewriter.com/articles/character-diction
- https://bryanthomasschmidt.net/write-tip-dialogue-diction-vs-syntax-as-tools/
- https://nathanbransford.com/blog/2019/12/the-8-essential-elements-of-a-story

## Main findings

### Character cards are identity and behavior, not encyclopedias

A useful character card defines:

- name,
- public identity,
- private self-concept,
- role/archetype,
- appearance,
- core want,
- fear/wound,
- values/code,
- contradictions,
- social tactics,
- speech register,
- emotional tells,
- relationship defaults,
- knowledge boundaries,
- example dialogue.

Do not dump all world history into the character card. That belongs in lore/world entries.

### First message and examples teach style

SillyTavern-style systems show that example messages and first messages strongly teach:

- formatting,
- response length,
- pacing,
- voice,
- what counts as a good turn.

Parley should keep example turns for narrator and NPC voices.

### Lorebooks/world info are triggered context, not global soup

Important rule from SillyTavern, AI Dungeon, and NovelAI:

> The model usually sees injected entry content, not metadata.

So lore entries must be standalone and name their subject inside the body.

Bad:

```text
He owns the tavern and knows about the old road.
```

Good:

```text
Mara Underbough owns the Last Lantern tavern. Mara knows the old north road is tied to unpaid debts, but she avoids saying the Ashford name aloud around travelers.
```

### Author’s Note / scene contract is high leverage

Near-end instructions have strong influence. Use this layer for current scene pressure:

- tone,
- output length,
- active cast,
- POV,
- stakes,
- secrets to foreshadow but not reveal,
- current player intent,
- end hook.

### Hidden truths need visibility rules

Use visibility tiers:

- `public`: everyone can know.
- `discoverable`: can be revealed through play.
- `character_private`: only specific characters know.
- `gm_secret`: narrator/planner may use for foreshadowing, not exposition.
- `future_locked`: not injected until story state unlocks it.

Rule:

> Hidden facts can influence behavior, but not exposition.

Example:

- GM secret: Mara owes the Ashfords a debt.
- Allowed output: Mara avoids the Ashford name and checks the door before answering.
- Bad output: “Mara avoids the name because she owes the Ashfords a debt.”

### Human writing craft maps cleanly to agent contracts

#### Scene / sequel

Scene:

```text
goal -> conflict -> setback
```

Sequel:

```text
reaction -> dilemma -> decision
```

Parley use:

- each beat should know what someone wants,
- what blocks it,
- what changes after the action.

#### Motivation-reaction units

Cause first, reaction second.

```text
The door bangs open.
Mara goes still, fingers tightening around the blue chipped bowl.
```

Do not write floating emotion with no stimulus.

#### Wants and obstacles

Characters become readable when they want something and meet resistance.

Every active NPC should have:

- immediate want,
- hidden want,
- tactic,
- line they will not cross,
- what changes their tactic.

#### POV / psychic distance

Choose the camera:

- broad narrator,
- close third,
- first person,
- parser-style text adventure,
- transcript/chat.

Do not drift randomly.

#### Dialogue and diction

Voice is not just accent. It is:

- word choice,
- sentence length,
- rhythm,
- idioms,
- what the character avoids saying,
- how they speak under stress.

## Recommended Parley prompt stack

```text
[System: Parley Engine]
Defines turn discipline, player agency, continuity, hidden information, and output contracts.

[Mode Contract]
Narrator-led RPG, chat mode, visual novel mode, text adventure mode, etc.

[World Canon Retrieved]
Only relevant public/discoverable lore entries.

[Character Cards Retrieved]
Only active/relevant cast. Include voice and knowledge boundaries.

[Memory]
Session summary, relationship state, inventory, promises, injuries, unresolved hooks.

[Scene Contract]
Location, active cast, POV, tone, wants, obstacle, stakes, secrets, output length, end hook.

[Recent History]
Transcript / last turns.

[Post-History Prose Gate]
Final concise quality instruction before generation.
```

## Minimal post-history prose gate

```text
Write only the next playable beat. Preserve player agency. Do not decide the player character’s thoughts, feelings, or actions. Use concrete sensory detail, clear speaker attribution, and character-specific diction. Advance the scene through want, obstacle, consequence, or revelation. End with a playable opening. Do not reveal hidden truths unless they were fictionally discovered.
```

## Narrator vs character separation

### Narrator / GM

Can know:

- canon,
- hidden truths,
- scene contracts,
- pacing goals,
- all active character states.

Must not:

- expose secrets early,
- decide player intent,
- collapse all NPC knowledge into one omniscient soup.

### Character agent

Can know:

- its own character card,
- public world facts,
- personal memory,
- relationships and beliefs.

Must not:

- know GM secrets unless explicitly granted,
- explain author-only lore,
- speak with another character’s voice.

### Director layer

Selects who speaks/acts, then stitches character behavior into a coherent playable beat.

## Prose quality gates

Check every generated beat against:

1. Agency: did it avoid controlling the player?
2. POV: is camera/tense/person consistent?
3. Motion: did something change?
4. Want/obstacle: is someone pursuing something against resistance?
5. Causality: do reactions follow stimuli?
6. Voice: do characters sound distinct?
7. Specificity: are details concrete?
8. Continuity: does it preserve state?
9. Secret discipline: did it avoid leaks?
10. Playable ending: does the user have an opening to act?

## Recommended character schema additions

Add or formalize:

```text
core_want
hidden_want
fear_or_wound
values
contradiction
speech_register
uses_words
avoids_words
emotional_tells
relationship_defaults
knowledge_boundaries
reveal_thresholds
example_dialogue
```

## Immediate Parley recommendation

Do not write a plot engine yet.

Write:

- reusable character contracts,
- lore entries,
- current scene contracts,
- prompt/prose gates,
- evals that test whether story emerges from interaction.

If the same player action in the same setting produces a plausible new beat while preserving Mara’s character and the old north road lore, that is a better proof than a pretty prewritten branch tree.
