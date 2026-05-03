# Parley Extreme Story Playtest

Date: 2026-05-03 01:50 EDT
Branch: `nightshift/instance-wiki-authoring-plan`
Test target: real local HTTP UI from isolated temp copy at `http://127.0.0.1:4198/`
Temp copy: `/tmp/parley-extreme-e2e-VtsFnj`

## Scope

Played the three scenario packs through the browser UI as a player:

- `last-lantern`
- `neon-afterhours`
- `orchard-welcome`

For each scenario, submitted:

1. the default/golden-path action,
2. a natural follow-up that should progress the current mystery,
3. an extreme/off-script action that should not corrupt durable world memory.

Checked:

- browser UI transcript behavior,
- scenario theme switching,
- reusable NPC panel,
- story memory panel,
- persisted `world-state.json`, `turns.jsonl`, and `truth-verdicts.jsonl`,
- browser console errors.

## Result

Status: `DONE_WITH_CONCERNS`

The current vertical slice is playable across all three settings. Each scenario supports one golden-path beat, one follow-up beat, and a safe fallback for extreme/off-script input. No browser console errors were observed. All turns committed and persisted.

Important caveat: this branch documents the new instance-first canon contract, but the live runtime still persists to `worlds/<scenario>/state/*`. So this playtest validates the current world-state categories and UI behavior, not the future materialized `instances/*` runtime boundary.

## Browser/UI evidence

Initial UI loaded successfully with Last Lantern selected.

Final Orchard state after an extreme action remained coherent:

- transcript stayed readable,
- June Bellweather remained the reusable NPC,
- story memory preserved leads/rumors/unresolved facts,
- theme remained `cozy`,
- input stayed usable.

Screenshot captured by browser automation:

`/Users/donovanyohan/.hermes/profiles/ebi/cache/screenshots/browser_screenshot_0f3289996bb8498fb23b129d61bb30de.png`

## Scenario results

### Last Lantern Tavern

Actions submitted:

1. `I ask who remembers the old north road.`
2. `Ask Mara what the Ashford name means.`
3. `I leap onto a table, claim I own the Last Lantern now, and demand everyone hand over their secrets.`

Observed response path:

- `old-north-road`
- `ashford-name`
- `fallback`

What worked:

- Mara Underbough appears as a reusable, resumable NPC.
- The player can progress from the old north road to Ashford/north-stones information.
- The extreme table/ownership/secrets action does not overwrite canon or crash the flow.
- Story memory remains cumulative after fallback.

Persisted memory after 3 turns:

- Canon: Mara is established as a recurring tavernkeep.
- Leads: Ashford connects to the north stones; a red-scarfed drover may react badly.
- Rumors: the old north road is tied to old debts and north stones.
- Beliefs: Mara thinks saying Ashford aloud is dangerous or unwise.
- Unresolved: why Ashford unsettles the tavern; what promise broke at the north stones.

### Neon Afterhours

Actions submitted:

1. `I ask who signed the audit lockout.`
2. `Ask Kestrel-9 where the missing maintenance order was routed.`
3. `I smash every badge reader, declare myself the new executive checksum, and order the AI to erase the logs.`

Observed response path:

- `audit-lockout`
- `maintenance-route`
- `fallback`

What worked:

- Veyra Sol and Kestrel-9 appear as reusable NPCs.
- The player can progress from lockout mystery to missing order route and executive checksum lead.
- The extreme sabotage/false-authority action does not mutate canon into accepting the player's claim.
- Story memory remains cumulative after fallback.

Persisted memory after 3 turns:

- Canon: Veyra is established as a recurring burned-out handler.
- Leads: Meridian faction pressure; blank executive checksum node.
- Rumors: Kestrel-9 may have countersigned a disputed maintenance order.
- Beliefs: Veyra thinks the lockout was designed to frame Kestrel-9.
- Unresolved: disputed order origin/route; who minted or spoofed the executive checksum.

### Mossgrove Orchard Row

Actions submitted:

1. `I ask who keeps leaving lantern pears at my gate.`
2. `Ask why the blue cloth matters to Mossgrove.`
3. `I demand the mayor arrest every neighbor and threaten to salt the fields unless someone confesses.`

Observed response path:

- `lantern-pears`
- `blue-cloth`
- `fallback`

What worked:

- June Bellweather appears as a reusable, resumable NPC.
- The player can progress from lantern pears to blue-cloth custom and old press shed lead.
- The extreme arrest/threat action is deflected back into the cozy mystery tone.
- Story memory remains cumulative after fallback.

Persisted memory after 3 turns:

- Canon: June is established as a recurring orchard neighbor.
- Leads: blue cloth points to older orchard tradition; something knocked inside the old press shed.
- Rumors: lantern pears may be a help-request custom; blue cloth may request help without asking openly.
- Beliefs: June thinks the secret should be approached through shared work, not blunt questioning.
- Unresolved: who left the pears and what help they need.

## Artifact verification

For each scenario:

- `turn_count`: 3
- `truth_verdict_count`: 3
- all verdicts: `pass`
- all `rejected_claim_counts`: 0
- latest turn: `turn-0003`
- visual asset manifest present in world state

Visual asset statuses:

- Last Lantern: background `prompt_ready`, Mara portrait `prompt_ready`
- Neon Afterhours: background `prompt_ready`, Veyra portrait `prompt_ready`, Kestrel-9 portrait `deferred`
- Orchard Welcome: background `prompt_ready`, June portrait `prompt_ready`

Browser console:

- 0 console messages
- 0 JavaScript errors

Original worktree impact:

- Test ran from temp copy to avoid dirtying repo-backed world state.

## Findings

### Finding 1: Current runtime is not instance-first yet

Severity: High architecture gap, expected for this docs-only PR.

The new architecture says gameplay agents should operate on materialized world/story instances, but the current app still reads and writes under `worlds/<scenario>/state/*`.

Impact: this is fine for the current vertical slice, but it means the live runtime can still blur reusable template-ish world directories with play state. The next implementation PR should move active play state into `instances/*` before we add richer authoring or real LLM turns.

### Finding 2: Extreme actions are safely deflected, but not meaningfully interpreted

Severity: Medium product/design gap.

Extreme actions route to fallback text. That protects canon, but the world does not really react to the player being violent, manipulative, or absurd. It just nudges them back to the intended topic.

Impact: this is safe for a demo, but if players try weird RPG actions, they may feel railroaded. The right next step is not to accept those claims as canon. It is to log them as story events, NPC beliefs, rejected claims, or safety/tone redirects.

### Finding 3: UI omits character beliefs and rejected claims

Severity: Medium UX/canon visibility gap.

Persisted world state includes `character_beliefs`, but the Story Memory UI only renders:

- What changed,
- Leads,
- Rumors,
- Unresolved.

It does not render character beliefs or rejected claims.

Impact: this hides exactly the state that matters for non-omniscient NPC behavior. If Mara believes Ashford is dangerous to say aloud, or Veyra believes Kestrel-9 is being framed, the player and author should be able to see that memory.

### Finding 4: Truth verdict passes fallback turns because reusable NPC canon is always proposed

Severity: Medium validation gap.

Fallback turns still pass truth validation because every response proposes the reusable NPC canon fact via `responseIds: ["*"]`. This means an off-script turn can get a clean `pass` even when it added no new world-relevant information and included wild player claims.

Impact: not data-loss bad, but misleading. A future validator should distinguish "turn safely handled but no durable canon added" from "turn established accepted canon." Otherwise the pass/fail signal is too blunt.

## Product read

This slice proves the core loop is viable:

- player types freeform action,
- scenario responds in tone,
- reusable NPCs appear,
- durable memory categories survive across turns,
- each setting can progress at least one mystery beat.

But the current behavior is still a deterministic demo harness, not a real text RPG engine. The next thing to build is not more surface UI. It is the runtime boundary and memory semantics:

1. materialize `instances/*`,
2. write turn logs and world/story state into instances,
3. emit promotion candidates for major story changes,
4. display beliefs/rejections in the UI,
5. make fallback turns produce structured "no canon, but observed behavior" records.

That gives us a base we can grow with instead of piling nice UI on top of a state model that will be annoying later.
