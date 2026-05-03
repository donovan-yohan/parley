# Runnable Scenario Packs

Parley now has three runnable scenario packs that use the same runtime and UI:

- `last-lantern` — grounded fantasy tavern mystery, `last-lantern` theme.
- `neon-afterhours` — cyberpunk corporate audit scene, `cyberpunk` theme.
- `orchard-welcome` — warm cozy orchard-neighbor scene, `cozy` theme.

Each pack lives at:

```text
scenarios/<scenario-id>/scenario.json
```

## Pack shape

A scenario pack defines the story-facing data Parley needs:

- scenario id, title, subtitle, opening narration
- theme id
- default player action
- suggested player intents
- world and scene metadata
- reusable character definitions backed by generic Belayer generated-talent fields
- deterministic local response snippets for the proof slice
- proposed facts split into canon, rumor, lead, belief, and unresolved thread
- `responseIds` on facts so fallback turns do not commit unsupported leads/rumors

The frontend does not branch on specific scenario ids. It loads `/api/scenarios`, then asks `/api/state?scenario=<id>` and posts `{ scenarioId, playerAction }` to `/api/turn`.

## Running the app

```bash
npm start
```

Open:

```text
http://127.0.0.1:4173
```

Use the Scenario selector to switch between all three packs. The selected pack updates the theme, scene title, opening narration, default input, and suggested actions.

## Verification

Run the full local proof suite:

```bash
npm test
npm run smoke:runtime
npm run smoke:e2e
npm run smoke:scenarios
```

`npm run smoke:scenarios` runs one turn in all three packs using temporary state directories, prints the actual narration, and verifies that each scenario produces:

- distinct narration
- scenario-specific reusable character records
- persisted `world-state.json`, `turns.jsonl`, and `truth-verdicts.jsonl`
- story memory with canon, rumor, lead, and unresolved thread categories

## Why this is not just a prompt-template demo

A prompt-template demo usually proves one thing: a blob of text can be styled differently.

This proves more:

1. **Same runtime, different worlds.** The same `runPlayerTurn` path handles fantasy, cyberpunk, and cozy packs by loading scenario data.
2. **Same UI, different scenes.** The browser reads scenario metadata from the API. It does not need custom UI branches per world.
3. **Durable state, not just chat.** Each turn persists inspectable artifacts: turns, truth verdicts, world state, and reusable character markdown.
4. **Structured story memory.** The runtime separates canon, rumors, leads, beliefs, and unresolved threads. The prose is not the only output.
5. **Belayer stays generic.** Characters are represented as generic generated talents. Parley owns the story metadata.

For a hackathon video, the montage should be a filming choice, not a special code path: switch scenario, submit the pack's default action, show the changed Story Memory and reusable NPCs, then move to the next pack.
