# Themed Story UI Smoke Devlog - 2026-05-02

## Highs

- Kept the branch on the existing vanilla HTML/CSS/JS slice instead of migrating to React/Vite early.
- Turned the raw truth verdict panel into player-facing story memory: what changed, leads, rumors, and unresolved mysteries.
- Added three CSS-variable theme presets to prove that world presentation can change without changing runtime story logic.
- Added `npm run smoke:e2e` so the smoke path prints the actual narration and checks the narrative jobs, not just file existence.

## Lows

- The UI is still hand-built DOM code. It is fine for this proof, but it will get brittle if more panels and state flows land here.
- The theme presets are source-level CSS presets, not world-bible data yet.
- The e2e smoke calls the deterministic runtime directly instead of driving a browser.

## Still Fake Or Hardcoded

- Mara Underbough, the Last Lantern scene, the Ashford lead, and the north-stones thread are deterministic hardcoded story content.
- The truth authority is a mock continuity editor, not a second model.
- Persistence is local JSON/JSONL without locking or multi-player concurrency.
- The NPC panel uses translated tags and a fixed in-world note, not generated character-card prose.
