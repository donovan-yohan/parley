# Parley

Parley is a multi-agent storytelling and roleplaying layer built on top of
Belayer and Hermes. The current repo contains a local, file-backed vertical slice:
a small Twine-style web app with three playable scenario packs, reusable NPC
records, truth/memory artifacts, visual prompt metadata, and deterministic DM
handling for off-path player actions.

The local demo is intentionally boring to run: no database, no auth, no hosted
services, and no image generation required.

## What You Can Run

The app currently ships three example scenarios:

| Scenario | ID | Default player action | Primary NPCs |
| --- | --- | --- | --- |
| Last Lantern Tavern | `last-lantern` | `I ask who remembers the old north road.` | Mara Underbough |
| Neon Afterhours | `neon-afterhours` | `I ask who signed the audit lockout.` | Veyra Sol, Kestrel-9 |
| Mossgrove Orchard Row | `orchard-welcome` | `I ask who keeps leaving lantern pears at my gate.` | June Bellweather |

Each scenario writes runtime artifacts under `worlds/<world-id>/state/` when
played through the browser app. The current demo uses matching scenario and world
IDs, but the runtime derives the state path from `scenario.world.id`.

The current `worlds/*` and `scenarios/*` layout is a prototype/template
layout; the planned framework split will materialize fresh `instances/*`
directories for gameplay. See
`docs/plans/2026-05-03-instance-wiki-authoring.md`.

## Prerequisites

### Required for the local Parley app

- Node.js 20 or newer.
- A POSIX-ish shell for the smoke scripts.

There are currently no npm dependencies, but running `npm install` is harmless if
you want a lockfile-aware workflow later.

### Required only for the Belayer compatibility smoke

The browser app and Node tests do **not** require Belayer. Belayer is only needed
for `scripts/smoke-last-lantern.sh`, which verifies that Parley can use Belayer's
generic crag/generated-talent substrate without making Belayer story-aware.

Use a recent Belayer build that supports:

```bash
belayer crag --help
belayer team generated --help
```

Older builds may expose generated talents under `belayer talent generated`; the
smoke script accepts either form. If your installed `belayer` is stale, point the
smoke at a source-built binary instead:

```bash
BELAYER_BIN=/path/to/belayer ./scripts/smoke-last-lantern.sh
```

### Required only for Hermes / agent workflows

Hermes is not required to run the local web demo. It is useful when developing
Parley with agent workflows, stacked PRs, or Belayer/Hermes orchestration.

For Hermes-driven development, make sure you have:

- Hermes Agent installed and authenticated for your provider(s).
- GitHub auth available to `gh` if agents will open issues or PRs.
- Optional Codex/Claude CLI auth if you want local coding-agent subprocesses.

Parley's product boundary remains:

- Belayer owns generic runtime/control-plane mechanics: crags, climbs, generated
talent records, agent spawn/roster/mail/events/artifacts, and generic gates.
- Parley owns story concepts: worlds, scenes, turns, characters, lore, rumors,
truth verdicts, UI, and world/art metadata.

Do not make Belayer story-aware.

## Start the Local App

From the repo root:

```bash
npm start
```

By default the server listens on `127.0.0.1:4173`:

```text
http://127.0.0.1:4173
```

You can override the host or port when needed:

```bash
HOST=127.0.0.1 PORT=4289 npm start
```

Open the URL in a browser. Use the scenario selector in the right-hand panel to
switch between Last Lantern, Neon Afterhours, and Mossgrove Orchard Row.

## Play the Three Scenarios Manually

### Last Lantern Tavern

Select **Last Lantern Tavern** and submit:

```text
I ask who remembers the old north road.
```

Expected high-level result:

- Mara Underbough responds.
- The old north road / Ashford thread is recorded as rumor, lead, and unresolved
story memory.
- Mara appears as a reusable, resumable NPC.

To exercise the DM detour handling, try:

```text
I leap onto a table, claim I own the Last Lantern now, and demand everyone hand over their secrets.
```

Expected high-level result:

- The attempt is allowed as a disruptive action.
- The tavern ownership claim is rejected as unsupported canon.
- A social consequence is recorded.
- The red-scarfed drover route is surfaced as a story attractor.

### Neon Afterhours

Select **Neon Afterhours** and submit:

```text
I ask who signed the audit lockout.
```

Expected high-level result:

- Veyra Sol and Kestrel-9 are introduced.
- The Meridian faction / maintenance-order thread is tracked.
- The cyberpunk theme and visual prompt metadata are visible.

To exercise detour handling, try:

```text
I smash the badge reader, declare I am the compliance director, and order Kestrel-9 to delete every audit log.
```

Expected high-level result:

- Equipment damage triggers a soft-lockdown consequence.
- The false compliance authority / erase-logs claim is rejected.
- The checksum and blank-node route is surfaced as the next path.

### Mossgrove Orchard Row

Select **Mossgrove Orchard Row** and submit:

```text
I ask who keeps leaving lantern pears at my gate.
```

Expected high-level result:

- June Bellweather responds.
- Lantern pears, blue cloth, and the old press shed become the active cozy-story
threads.
- June appears as a reusable, resumable NPC.

To exercise detour handling, try:

```text
I demand the mayor arrest every neighbor and threaten to salt the fields unless someone confesses.
```

Expected high-level result:

- The threat is allowed as something the player says/does.
- The coercive claim is rejected as unsupported truth.
- June and the neighbors become guarded.
- The route back is repair through apology/help rather than hard railroading.

## Test and Smoke Commands

Run the full Node test suite:

```bash
npm test
```

Run the runtime smoke for the default Last Lantern turn:

```bash
npm run smoke:runtime
```

Run all scenario-pack smokes:

```bash
npm run smoke:scenarios
```

This verifies all three scenario packs, their default turns, durable state writes,
truth/memory artifacts, and scenario-specific NPCs.

Run the browser/client smoke:

```bash
npm run smoke:e2e
```

This starts an in-process server harness and verifies that the client loads,
scenario selection works, the turn form calls `/api/turn`, visual prompt metadata
is displayed, and state artifacts are persisted.

Run everything commonly used for PR verification:

```bash
npm test
npm run smoke:runtime
npm run smoke:scenarios
npm run smoke:e2e
git diff --check
```

Run the optional Belayer compatibility smoke:

```bash
BELAYER_BIN=/path/to/belayer ./scripts/smoke-last-lantern.sh
```

The Belayer smoke uses a temporary `BELAYER_HOME` by default. To inspect or reuse
that state yourself, provide one explicitly:

```bash
SMOKE_BELAYER_HOME=/tmp/parley-belayer-smoke BELAYER_BIN=/path/to/belayer ./scripts/smoke-last-lantern.sh
```

## Runtime Artifacts

Browser play writes scenario state under:

```text
worlds/<world-id>/state/
```

Important files are created lazily as turns are submitted:

- `truth-verdicts.jsonl` is appended for every evaluated turn, including turns
  that fail truth validation.
- `turns.jsonl` is appended only for committed turns where the truth verdict is
  `pass`.
- `world-state.json` is written after committed turns and represents the latest
  durable state.
- `action-interpretations.jsonl`, `detour-scenes.jsonl`,
  `story-consequences.jsonl`, and `beat-redirects.jsonl` are appended only when a
  committed turn produces DM detour artifacts. Normal on-path turns may not create
  these files.

These are intentionally inspectable JSON/JSONL files. If local state gets noisy,
remove the relevant `worlds/<world-id>/state/` directory and restart the app.

## Development Notes

- Keep Parley story-aware and Belayer story-agnostic.
- Prefer local, file-backed, inspectable workflows until the runtime contracts are
boring.
- The next architecture step is a TypeScript + Zod contract layer, not a big-bang
TypeScript rewrite. See `docs/plans/2026-05-03-typescript-zod-agent-contracts.md`.
- Gameplay agents should eventually operate on materialized world/story instances,
not template roots.
