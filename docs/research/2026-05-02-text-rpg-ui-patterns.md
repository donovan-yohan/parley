# Text RPG UI Research — 2026-05-02

## Recommendation

Parley should use a **prose-first RPG layout**:

```text
center story panel + stacked action cards + lightweight state rail + collapsible context drawers + optional AI repair controls
```

The player should always be able to answer:

1. where am i?
2. what just happened?
3. who matters here?
4. what can i do next?
5. what changed in the world?
6. can i fix/steer the AI if it gets stupid?

## Player jobs-to-be-done

### 1. Understand the immediate situation

Show:

- location title,
- time/scene state,
- active cast,
- current prose,
- latest consequence.

### 2. Choose the next action confidently

Use action cards, not raw links.

Cards can show:

- verb-led label,
- risk/cost,
- stat/check used,
- locked reason,
- story-critical marker.

### 3. Track state without bookkeeping fatigue

Constantly visible state should be lightweight:

- location,
- turn/time,
- health/stress/morale if used,
- active objective,
- key relationship/suspicion signal,
- important resource count.

Deep state belongs in drawers.

### 4. Remember story continuity

Use player-facing panels:

- Journal,
- Current Leads,
- Known Rumors,
- NPC Notes,
- Unresolved Mysteries.

Do not show raw state IDs unless debug mode is on.

### 5. Recover from AI weirdness

Generative text RPGs need repair controls:

- undo,
- retry,
- edit,
- continue,
- branch/save checkpoint,
- pin as canon,
- mark as rumor/non-canon.

Without these, the player has no agency when the model derails. and it will derail, because of course it will.

## Patterns worth copying

### Twine

Sources:

- https://christytuckerlearning.com/visual-design-for-scenarios-in-twine/

Useful pattern:

- prose-first page,
- styled passages,
- readable typography,
- simple progression.

Parley takeaway:

- prioritize reading comfort and passage composition.

### Choice of Games / ChoiceScript

Sources:

- https://www.choiceofgames.com/dragon/
- https://www.choiceofgames.com/make-your-own-games/customizing-the-choicescript-stats-screen/

Useful pattern:

- prose dominates,
- choices are clear,
- stats are secondary but accessible.

Parley takeaway:

- good interaction clarity, but default UI feels too much like a survey.
- copy the clarity, not the visual blandness.

### Fallen London

Sources:

- https://www.mobygames.com/game/51864/fallen-london/screenshots/browser/699552/
- https://fallenlondon.wiki/wiki/Storylets

Useful pattern:

- storylets/action cards,
- location-specific choices,
- qualities/state as game memory,
- repeatable vs important actions.

Parley takeaway:

- strong model for `scene -> available storylets -> consequence -> state update`.

### Sorcery! / 80 Days

Sources:

- https://www.inklestudios.com/2013/03/12/sorcery-screenshots.html
- https://store.steampowered.com/app/381780/80_Days/
- https://intfiction.org/t/exploring-the-best-games-80-days-by-inkle/10279

Useful pattern:

- material-feeling UI,
- map/route layer,
- travel/resource planning,
- touch-friendly choices.

Parley takeaway:

- if geography matters, build a map/route layer. do not make players infer world topology from vibes.

### Disco Elysium

Sources:

- https://www.rpgfan.com/gallery/disco-elysium-screenshots/
- https://discoelysium.fandom.com/wiki/Skills

Useful pattern:

- skills as voices,
- inline checks,
- dialogue list with numbered actions,
- state and character psychology integrated into prose.

Parley takeaway:

- mechanics can speak. stats should not only be spreadsheet numbers.

### AI Dungeon

Sources:

- https://help.aidungeon.com/faq/the-basics
- https://help.aidungeon.com/faq/how-to-play
- https://help.aidungeon.com/faq/the-memory-system
- https://help.aidungeon.com/faq/story-mode
- https://help.aidungeon.com/faq/see-mode

Useful pattern:

- action modes: Do, Say, Story, See,
- Continue/Edit/Retry/Undo controls,
- memory/story cards.

Parley takeaway:

- AI co-authoring is a different UX than static IF. expose repair and steering controls early.

### SillyTavern

Sources:

- https://docs.sillytavern.app/usage/core-concepts/uicustomization/
- https://docs.sillytavern.app/usage/user-settings/visual-novel/
- https://docs.sillytavern.app/usage/core-concepts/worldinfo/
- https://docs.sillytavern.app/usage/core-concepts/personas/
- https://docs.sillytavern.app/usage/core-concepts/groupchats/

Useful pattern:

- multiple presentation modes,
- visual novel mode,
- personas,
- group chats,
- lorebooks/world info,
- deep user theme customization.

Parley takeaway:

- Parley should support layout modes over time:
  - Story Mode,
  - Chat Mode,
  - RPG Mode,
  - VN Mode.

### Hermes dashboard theming

Sources:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard
- https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard

Useful pattern:

- palette,
- typography,
- density,
- radius,
- layout variants,
- custom CSS/assets,
- dashboard extension seams.

Parley takeaway:

- world theming should be structured and user-extensible.

## Recommended screen zones

### Desktop

```text
top bar
  title, location, turn/time, save/status, theme/settings

left rail
  player state, portrait, conditions, key resources

center
  location title, prose, dialogue, latest result, action cards

right drawer/rail
  journal, leads, NPC notes, map, lore, debug truth if enabled

bottom action area
  freeform input, Do/Say/Story modes, undo/retry/edit/continue
```

### Mobile

```text
story first
sticky bottom action/input
state compressed into chips
context panels as drawers/tabs
full-width action cards
```

## Current Parley UI critique

Good:

- atmosphere is coherent,
- left story / right state split works,
- next choices are useful,
- Mara and truth artifacts are visible after a turn.

Bad:

- sidebar is too developer-facing,
- `Truth Verdict` reads like test harness output,
- NPC tags expose raw implementation IDs,
- input keeps the previous submitted action,
- choices are clickable list items, not buttons,
- no journal/leads/player-facing consequence layer,
- only one theme exists.

## Recommended Parley direction

Parley should combine:

1. Fallen London storylet/action cards.
2. ChoiceScript readability/stat discipline.
3. Sorcery/80 Days map/travel layer when geography matters.
4. Disco Elysium inline voice/mechanic flavor.
5. AI Dungeon repair controls.
6. SillyTavern/Hermes theming and layout customization.

Immediate UI target:

```text
The story is the star.
The player’s next action is obvious.
State is translated into leads/NPC notes/journal, not debug IDs.
Themes can change the whole world feel without touching runtime logic.
```
