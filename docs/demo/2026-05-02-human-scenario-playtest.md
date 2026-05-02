# Human Scenario Playtest — Runnable Scenario Packs

This is a browser-level playtest of the three runnable Parley scenario packs. The test used the local web app, selected each scenario through the UI scenario selector, submitted three human-authored actions per scenario, and inspected the rendered transcript, reusable NPC panel, Story Memory panel, and file-backed state artifacts.

## Verdict

- The scenarios are actually runnable through the UI, not only through unit/runtime smoke scripts.
- Each scenario produced a distinct story transcript, reusable NPC records, and durable Story Memory.
- Off-script/fallback turns did not erase previously discovered story memory.
- During this playtest, two issues were found and fixed: world state was not cumulative after fallback turns, and follow-up response prose omitted full NPC names required by the mock truth authority.

## Strictness note

The current scenario packs are intentionally deterministic demo fixtures. They should not become the long-term LLM contract. The durable constraints should stay strict: scenario metadata, world boundaries, NPC records, hidden truths, fact categories, and truth-verdict schemas. The moment-to-moment beat selection should become fuzzy/LLM-authored: player intent classification, response drafting, and proposed fact extraction should not depend on brittle `matchAny` phrase routing.

In other words: strict world contract, loose player-language interpretation. The demo packs prove the state/UI/runtime seam; they are not the final storytelling brain.

## Last Lantern Tavern (`last-lantern`)

### Transcript

**Player:** I ask who remembers the old north road.

**Narrator:** Mara Underbough pauses with one hand on a blue chipped bowl, warm enough to keep serving and watchful enough to notice who stops breathing. "The old north road remembers debts better than people do," she says. Around the Last Lantern, talk thins to rain on shutters. "Ashford is a lead, not an answer. For the next thread, ask after the north stones, but spend that name softly and choose who hears it."

**Player:** Ask Mara what the Ashford name means.

**Narrator:** Mara Underbough does not look toward the door when you say Ashford, which somehow makes the whole room look there for her. "Old family, older promise," she says. "The north stones mark where that promise broke. If you mean to tug that thread, do it after closing, and do not let the red-scarfed drover hear you ask."

**Player:** I lie and say I already solved it.

**Narrator:** Mara Underbough studies you from behind the tavern bar. "Start with what road brought you here," she says, "and I will tell you which names the Last Lantern still remembers."

### Story Memory

**Canon:**
- `mara-underbough-reusable` — Mara Underbough is established as a recurring tavernkeep the player can return to in later scenes.

**Leads:**
- `old-north-road-lead` — Ashford is a lead connected to the north stones, not a solved truth.
- `red-scarfed-drover-lead` — A red-scarfed drover in the Last Lantern may react badly to questions about Ashford.

**Rumors:**
- `old-north-road-rumor` — The old north road is tied to old debts and the north stones.

**Beliefs:**
- `ashford-name-belief` — Mara believes saying the Ashford name loudly in the tavern is dangerous or unwise.

**Unresolved:**
- `ashford-name-mystery` — Why the Ashford name unsettles the Last Lantern remains unresolved.
- `north-stones-broken-promise` — The north stones mark a broken promise connected to the Ashford name.

### Reusable NPCs

- `mara-underbough` — Mara Underbough (resumable, reusable=True)

### Truth verdicts

- `turn-0001`: `pass`; leads=1; rumors=1; unresolved=1; rejected=0
- `turn-0002`: `pass`; leads=1; rumors=0; unresolved=1; rejected=0
- `turn-0003`: `pass`; leads=0; rumors=0; unresolved=0; rejected=0

## Neon Afterhours (`neon-afterhours`)

### Transcript

**Player:** I ask who signed the audit lockout.

**Narrator:** Veyra Sol laughs once, dry enough to sound like a printer jam. "No human signed the audit lockout," she says, tapping the dead badge reader with two fingers. "Kestrel-9 countersigned a maintenance order that Legal swears never existed." The ceiling camera tilts a centimeter. Kestrel-9 adds, "Correction: I witnessed pressure from the Meridian faction and preserved the receipt."

**Player:** I ask Kestrel-9 where the missing maintenance order was routed.

**Narrator:** Kestrel-9 paints the wall with a map of dead approvals: Facilities, Legal, then a blank node wearing an executive checksum. Veyra Sol exhales through her teeth. "That blank node is the trick," she says. "Someone made the audit floor believe an executive existed long enough to shut every door."

**Player:** I lie and say I already have the board receipt.

**Narrator:** Veyra Sol keeps her hands wrapped around a paper cup gone cold. "Ask about the lockout," she says. "Everything else on this floor is decoration until we know who wanted the audit blind." Kestrel-9 leaves a cursor blinking on the wall display.

### Story Memory

**Canon:**
- `veyra-sol-reusable` — Veyra Sol is established as a recurring burned-out handler contact on the Helix audit floor.

**Leads:**
- `meridian-faction-lead` — The Meridian faction may have pressured the audit AI during the lockout.
- `blank-exec-checksum-lead` — The disputed maintenance order passed through a blank executive checksum node.

**Rumors:**
- `audit-ai-rumor` — Kestrel-9 may have countersigned a maintenance order that Legal denies existed.

**Beliefs:**
- `veyra-handler-belief` — Veyra believes the audit lockout was designed to make Kestrel-9 look responsible.

**Unresolved:**
- `missing-maintenance-order` — The origin and route of the disputed maintenance order remain unresolved.
- `executive-checksum-mystery` — Who minted or spoofed the executive checksum remains unresolved.

### Reusable NPCs

- `veyra-sol` — Veyra Sol (resumable, reusable=True)
- `kestrel-9` — Kestrel-9 (resumable, reusable=True)

### Truth verdicts

- `turn-0001`: `pass`; leads=1; rumors=1; unresolved=1; rejected=0
- `turn-0002`: `pass`; leads=1; rumors=0; unresolved=1; rejected=0
- `turn-0003`: `pass`; leads=0; rumors=0; unresolved=0; rejected=0

## Mossgrove Orchard Row (`orchard-welcome`)

### Transcript

**Player:** I ask who keeps leaving lantern pears at my gate.

**Narrator:** June Bellweather looks over the orchard fence with flour on one sleeve and a smile that stops just short of an answer. "Lantern pears choose their own doorsteps," she says, which is how Mossgrove people talk when they are protecting someone. She nods toward the old press shed. "Help with cider hour, and folks may remember which neighbor still ties blue cloth the old way."

**Player:** Ask June why the blue cloth matters to Mossgrove.

**Narrator:** June Bellweather brushes flour from her sleeve and ties the blue cloth around the basket handle with practiced fingers. "It used to mean no one asks at the front door," she says. "You leave fruit, folks bring help, and pride stays fed." From the old press shed comes one careful knock, then silence.

**Player:** I lie and say June already confessed.

**Narrator:** June Bellweather sets a basket on the fence rail. "Start with the pears," she says. "Mossgrove keeps its secrets in chores, not locked rooms." The orchard answers with bees, leaves, and the creak of the press shed door.

### Story Memory

**Canon:**
- `june-bellweather-reusable` — June Bellweather is established as a recurring orchard neighbor the player can return to in Mossgrove.

**Leads:**
- `blue-cloth-lead` — The blue cloth tied around the pears points toward an older orchard-row tradition.
- `press-shed-knock-lead` — Someone or something knocked once from inside the old press shed.

**Rumors:**
- `lantern-pear-rumor` — Lantern pears left at a gate may be a Mossgrove way of asking for help without naming the need.
- `blue-cloth-custom-rumor` — Blue cloth may be an old Mossgrove custom for requesting help without asking openly.

**Beliefs:**
- `june-kind-evasive-belief` — June believes the town secret should be approached through shared work, not blunt questioning.

**Unresolved:**
- `orchard-family-secret` — Who left the pears, and what help they are quietly requesting, remains unresolved.

### Reusable NPCs

- `june-bellweather` — June Bellweather (resumable, reusable=True)

### Truth verdicts

- `turn-0001`: `pass`; leads=1; rumors=1; unresolved=1; rejected=0
- `turn-0002`: `pass`; leads=1; rumors=1; unresolved=0; rejected=0
- `turn-0003`: `pass`; leads=0; rumors=0; unresolved=0; rejected=0

