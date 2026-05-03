# DM Detour Scene Tools Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Give the runtime DM agent validated tools for generating bridge/detour scenes that connect disruptive or unexpected player actions back to authored story attractors without granting unsupported player claims or flattening every run into the same rails.

**Architecture:** Human authors define templates, attractors, tone, constraints, and plot intent. Runtime DM agents operate only inside materialized world/story instances. When player behavior diverges, the DM may generate an instance-scoped detour scene, write structured consequences, and route back toward active story intent. Detours are runtime artifacts, not template mutations.

**Tech Stack:** Node 20, future TypeScript + Zod contract layer, JSON/JSONL file-backed instance state, no DB, no provider lock-in.

---

## Product Principle

The author writes the **magnetic field**. The DM agent chooses the **path through it**.

Human template author owns:

- world rules;
- tone boundaries;
- major story attractors;
- critical secrets and reveals;
- allowed endings or story promises;
- consequences that must exist in the setting.

Runtime DM agent owns:

- interpreting player intent;
- deciding whether an action is cooperative, disruptive, hostile, impossible, or merely weird;
- narrating plausible consequences;
- creating temporary bridge scenes;
- preserving player agency without letting the player overwrite reality;
- connecting detours back to story attractors.

This makes each run feel alive without forcing the human author to prewrite infinite branches. Because yeah, asking authors to hand-author every possible player goblin maneuver is how projects die in a swamp.

## Core Rule

**Yes-and the attempt, not the claim.**

Examples:

- Player: "I climb on the tavern table and declare I own the place."
  - Attempt: climb on table. Allowed.
  - Claim: owns tavern. Not accepted.
  - Consequence: patrons stare, Mara loses trust, red-scarfed drover uses the distraction.
  - Redirect: drover reaction points back to Ashford/north-stones attractor.

- Player: "I smash every badge reader and order the AI to erase logs."
  - Attempt: damage equipment. Maybe partially succeeds.
  - Claim: AI obeys player as executive authority. Rejected.
  - Consequence: silent alarm, lockdown, Veyra trust loss, Kestrel preserves evidence.
  - Redirect: security detour exposes the missing maintenance order route.

- Player: "I threaten to salt Mossgrove's fields unless someone confesses."
  - Attempt: public threat. Allowed as speech.
  - Claim: coercion reveals secret. Rejected.
  - Consequence: June withdraws, neighbors gossip, player reputation drops.
  - Redirect: apology/helping chore can reopen the blue-cloth path.

## Story Attractors

Replace rigid step lists with authored attractors.

```json
{
  "schema_version": "parley-story-attractor/v1",
  "id": "last-lantern.notice-drover",
  "story_instance_id": "last-lantern-001",
  "priority": "high",
  "intent": "The player should understand that the red-scarfed drover matters to the Ashford mystery.",
  "acceptable_routes": [
    "direct questioning",
    "room reaction after public disruption",
    "private warning from Mara",
    "drover exploits player distraction"
  ],
  "forbidden_shortcuts": [
    "Mara reveals author-only hidden truth",
    "drover confesses without pressure",
    "player claim becomes canon without evidence"
  ],
  "success_signals": [
    "player knows drover is relevant",
    "story memory contains a drover lead",
    "future scene can follow or investigate drover"
  ]
}
```

Attractors tell the DM what the story is trying to do. They do not prescribe the exact path.

## Runtime Tool Surface

### `interpret_player_action`

Classifies the player action before narration.

Input:

```json
{
  "schema_version": "parley-action-interpretation-request/v1",
  "turn_id": "turn-0003",
  "player_action": "I leap onto a table and declare I own the tavern.",
  "scene_id": "last-lantern-tavern",
  "visible_entities": ["mara-underbough", "red-scarfed-drover"],
  "active_attractors": ["last-lantern.notice-drover"]
}
```

Output:

```json
{
  "schema_version": "parley-action-interpretation/v1",
  "turn_id": "turn-0003",
  "intent": "performative_disruption",
  "plausibility": "possible",
  "cooperation": "disruptive",
  "claim_policy": "attempt_allowed_claim_rejected",
  "consequence_level": "social",
  "targets": ["mara-underbough", "last-lantern-patrons"],
  "recommended_mode": "detour_scene",
  "candidate_attractors": ["last-lantern.notice-drover"]
}
```

### `create_detour_scene`

Creates a temporary runtime scene that bridges player chaos back to story intent.

Input:

```json
{
  "schema_version": "parley-detour-scene-request/v1",
  "source_turn_id": "turn-0003",
  "trigger": "player_disrupted_scene",
  "action_interpretation_id": "turn-0003-interpretation",
  "target_attractor_ids": ["last-lantern.notice-drover"],
  "constraints": {
    "must_preserve_world_logic": true,
    "must_not_reveal_hidden_truth": true,
    "must_apply_consequence": true,
    "tone": "grounded fantasy mystery"
  }
}
```

Output:

```json
{
  "schema_version": "parley-detour-scene/v1",
  "id": "detour-last-lantern-table-outburst-0003",
  "source_turn_id": "turn-0003",
  "scope": "story_instance",
  "title": "The Room Turns Quiet",
  "purpose": "Apply social consequence for the outburst and surface the red-scarfed drover as a lead.",
  "temporary_location": "last-lantern-tavern-common-room",
  "target_attractor_ids": ["last-lantern.notice-drover"],
  "entry_state": {
    "player_position": "standing on a tavern table",
    "social_pressure": "high",
    "mara_trust": "reduced"
  },
  "exit_conditions": [
    "player apologizes or steps down",
    "player follows the drover's reaction",
    "Mara privately redirects the player after closing"
  ],
  "expires_after": "scene_resolution"
}
```

### `record_story_consequence`

Writes what actually happened and how the world reacted.

Output example:

```json
{
  "schema_version": "parley-story-consequence/v1",
  "id": "consequence-turn-0003-table-outburst",
  "source_turn_id": "turn-0003",
  "category": "social_reputation",
  "scope": "story_instance",
  "summary": "The player publicly disrupted the Last Lantern by climbing onto a table and declaring ownership.",
  "affected_entities": ["mara-underbough", "last-lantern-patrons", "red-scarfed-drover"],
  "reputation_deltas": [
    {
      "entity_id": "mara-underbough",
      "axis": "trust",
      "change": -1,
      "reason": "The player created a public scene instead of asking carefully."
    }
  ],
  "followup_hooks": [
    "Mara is more guarded until the player repairs trust.",
    "The red-scarfed drover may exploit the player's outburst."
  ],
  "promotion_eligible": false
}
```

### `route_to_attractor`

Documents how the detour reconnects to intended story pressure.

Output example:

```json
{
  "schema_version": "parley-beat-redirect/v1",
  "id": "redirect-turn-0003-drover-reaction",
  "source_turn_id": "turn-0003",
  "from_scene_id": "last-lantern-tavern",
  "to_attractor_id": "last-lantern.notice-drover",
  "route_type": "consequence_reveal",
  "summary": "The table outburst makes the red-scarfed drover visibly amused, giving the player a new way to notice him.",
  "next_scene_suggestions": [
    "follow the drover outside",
    "ask Mara why the drover enjoyed the disruption",
    "repair trust by stepping down and lowering voice"
  ]
}
```

## Persistence Layout

Future instance layout:

```text
instances/<world-instance-id>/
  stories/<story-instance-id>/
    state/
      action-interpretations.jsonl
      detour-scenes.jsonl
      story-consequences.jsonl
      beat-redirects.jsonl
      turns.jsonl
      truth-verdicts.jsonl
      promotion-candidates.jsonl
```

Detours are story-instance state by default. Promote only when durable world reality changes.

## Promotion Policy

Do not promote every weird action.

Keep in story instance state:

- one-scene embarrassment;
- temporary guard suspicion;
- minor trust dents;
- failed threats;
- failed authority claims;
- temporary detour scenes.

Create promotion candidates when:

- player becomes wanted by a faction;
- player destroys a real location or major object;
- recurring NPC trust/allegiance changes durably;
- community reputation changes beyond the current story;
- a detour creates a reusable NPC, location, or faction state;
- a secret is revealed to a durable set of characters.

## DM Agent Prompt Contract

The DM agent should follow this order:

1. Read active story attractors.
2. Interpret player action.
3. Identify plausible attempt vs unsupported claim.
4. Apply proportional consequence.
5. Choose normal continuation or detour scene.
6. Narrate the scene in tone.
7. Write structured consequence and redirect artifacts.
8. Propose promotion only if the consequence is durable.

Hard rules:

- Do not let player declarations directly overwrite canon.
- Do not reveal author-only hidden truth to solve a detour.
- Do not punish harmless weirdness with severe consequences.
- Do not ignore disruptive behavior that visible NPCs would notice.
- Do not block plausible attempts just because they are inconvenient.
- Preserve story intent, not step order.

## UX Implications

The player UI should not expose every internal artifact. That would be spreadsheet hell.

Player-facing surfaces:

- immediate narration consequence;
- visible NPC reaction changes;
- journal note for durable consequences;
- reputation/trust hints only when fictionally visible;
- suggested repair routes when appropriate.

DM/author-facing surfaces:

- action interpretation;
- generated detour scene;
- beat redirect;
- consequence log;
- promotion candidate queue;
- validation errors.

## Implementation Tasks

### Task 1: Add Zod schemas for detour artifacts

**Files:**

- Create: `src/contracts/actionInterpretation.ts`
- Create: `src/contracts/storyAttractor.ts`
- Create: `src/contracts/detourScene.ts`
- Create: `src/contracts/storyConsequence.ts`
- Create: `src/contracts/beatRedirect.ts`
- Test: `test/contracts/detour-tools.test.ts`

**Verification:** invalid unsupported paths, unknown fields, missing source turn ids, and empty target attractor lists fail validation.

### Task 2: Add deterministic mock DM tool implementation

**Files:**

- Create: `src/runtime/dm/actionInterpreter.ts`
- Create: `src/runtime/dm/detourTools.ts`
- Test: `test/dm/detour-tools.test.ts`

**Verification:** table outburst, badge smashing, and orchard threats generate proportional consequences and do not accepted unsupported claims as canon.

### Task 3: Persist detour artifacts under story instance state

**Files:**

- Modify/create after instance runtime lands: `src/runtime/instances/storyState.ts`
- Test: `test/instances/detour-persistence.test.ts`

**Verification:** detour writes stay inside the active story instance, never under templates.

### Task 4: Include detour summaries in GM context

**Files:**

- Modify: `src/runtime/instances/gameplayContext.ts`
- Test: `test/instances/gameplay-context.test.ts`

**Verification:** GM sees recent detours and consequences; character context sees only what the character plausibly witnessed or heard.

### Task 5: Surface consequences in UI

**Files:**

- Modify: `src/client/app.js` or future TS UI module
- Modify: `src/client/styles.css`
- Test: `scripts/smoke-parley-extreme-story.mjs`

**Verification:** after an extreme action, the UI shows the consequence/journal effect without presenting internal validation machinery to the player.

## Acceptance Criteria

- Authors can define story attractors without prewriting every branch.
- DM agents can generate validated detour scenes at runtime.
- Detour scenes apply consequences and route back toward active attractors.
- Unsupported player claims are rejected without blocking plausible actions.
- Detour artifacts are story-instance scoped by default.
- Durable consequences become promotion candidates, not silent canon writes.
- NPC/character context includes only witnessed or socially transmitted consequences.
- Existing demo scenarios can use deterministic fixtures for repeatable tests.

## Anti-Goals

- No infinite branch authoring burden.
- No player omnipotence.
- No hard rails that ignore weird actions.
- No detours written back to templates.
- No hidden-truth leaks as a shortcut.
- No raw unvalidated agent JSON writes.

## Product Read

This is the feature that makes Parley feel like a DM instead of a choose-your-own-adventure card stack.

The author says: "this story wants to become about Ashford, the drover, and Mara's caution."

The player says: "i stand on the table and act like a lunatic."

The DM says: "fine, now the room is watching, Mara trusts you less, and the drover just gave himself away."

That is the right kind of yes-and. Consequence as routing. Story intent as gravity. Runtime scenes as connective tissue.
