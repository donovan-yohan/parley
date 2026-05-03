# Parley

Parley is a multi-agent storytelling and roleplaying layer built on top of
Belayer and Hermes. This worktree contains the first local Last Lantern vertical
slice: a small Twine-style web app backed by file-based Parley runtime state.

## Run the Local App

```bash
npm start
```

Open `http://localhost:4173`, then submit:

```text
I ask who remembers the old north road.
```

The UI shows the transcript, next choices, a reusable NPC list, and the mock
truth verdict for the turn. Runtime artifacts are written under
`worlds/last-lantern/state/`.

That `worlds/<id>/state/` path is the current prototype layout. The planned
framework split treats `worlds/*` and `scenarios/*` as template seed material and
materializes fresh `instances/*` directories for gameplay. See
`docs/plans/2026-05-03-instance-wiki-authoring.md`.

## Smoke and Tests

```bash
npm test
npm run smoke:runtime
```

The runtime smoke clears generated state artifacts, submits the old north road
prompt, and verifies that:

- Mara Underbough appears in the narration.
- Mara is returned as a reusable resumable character.
- world, turn, and truth verdict artifacts are written.

The Belayer compatibility smoke remains separate:

```bash
BELAYER_BIN=/path/to/belayer ./scripts/smoke-last-lantern.sh
```

It verifies only Belayer's generic crag and generated-talent mechanics. Story
concepts stay in Parley.
