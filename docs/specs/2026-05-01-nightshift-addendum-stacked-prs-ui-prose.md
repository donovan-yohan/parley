# Parley Night Shift Addendum — Stacked PRs, UI, Prose Quality

User direction captured during the night-shift run:

- Use Codex and Claude to their strengths.
- Agents should use commits and stacked PRs to separate features.
- Experiment and take this far.
- Bare minimum: solid POC.
- Stretch goals:
  - Twine-inspired UI with color-coded dialogue by character.
  - Show who is speaking clearly.
  - Think through how to reveal or hide characters' behind-the-scenes thinking.
  - Design infrastructure that makes the output prose worth reading, not generic roleplay sludge.
  - Borrow useful concepts from AI roleplay character cards, silly taverns-style cards, lore bibles, and interactive fiction.
  - Keep the distinctive value: federation of agents / Belayer talents as reusable characters.

## Stacked PR Plan

Prefer separate branches/PRs:

1. `nightshift/docs-world-contracts`
   - world bible/library
   - character/talent schema
   - truth authority schema
   - portrait prompt seam

2. `nightshift/runtime-skeleton`
   - file-backed Parley runtime
   - turn processing
   - reusable character persistence
   - truth verdict persistence

3. `nightshift/twine-ui`
   - local web UI
   - transcript/input/choices/NPC panel
   - color-coded speaker dialogue

4. `nightshift/prose-quality-gates`
   - prose quality rubric
   - second-LLM continuity/prose reviewer contract
   - tests/fixtures for boring output vs good output

5. `nightshift/image-portraits-seam`
   - world art style prompts
   - character portrait metadata
   - optional Hermes image-gen integration stub

## Prose Quality Direction

The system should eventually gate on:

- specificity over generic fantasy filler
- scene-grounded sensory detail
- character voice consistency
- restraint: avoid lore dumping
- meaningful next choices
- callbacks that feel earned, not forced
- no omniscient leakage from hidden truth into NPC dialogue

## Behind-The-Scenes Thinking UX

Do not expose raw chain-of-thought. Instead expose authored, safe layers:

- public narration
- character speech
- optional character intent/mood tags
- GM notes / scene state
- truth authority verdict summary
- hidden debug view for developers only

