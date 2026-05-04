# Belayer Profile Coupling — End-to-End Demo Guide

**Date:** 2026-05-04
**Branch:** feat/live-ui-wiring

This guide walks through a full materialization-to-image-render demo using the
Last Lantern world as the reference instance.

---

## 1. Prerequisites

- **Belayer** installed and on `$PATH`:
  ```
  go install github.com/belayer-project/belayer@latest
  ```
- **Hermes** authed with a profile that has `image_gen.provider` configured
  (e.g., `fal` with a valid API key).  If you don't have an image provider, the
  demo still runs — image generation steps will be skipped or return a
  placeholder path.
- Node 20+ and `npm install` already run in the repo root.

---

## 2. One-Shot Setup

Materialize a demo instance from the Last Lantern world template:

```
npm run instance:materialize -- --world last-lantern --as last-lantern-demo
```

This creates:

- `instances/last-lantern/last-lantern-demo/` (instance directory + manifest)
- Hermes talent profiles for every character plus two art talents:
  - `blyr-last-lantern-demo-background-artist`
  - `blyr-last-lantern-demo-portrait-artist`
- A Belayer crag registered as `last-lantern-demo`

---

## 3. Start the Daemon and Dev Server

```
belayer daemon &
npm start
```

`belayer daemon` keeps a local transport alive so wake mails reach talent
profiles without a network round-trip.  `npm start` serves the Parley UI and
API on `localhost:3000` (or the port printed to stdout).

---

## 4. Open the Browser

Navigate to `http://localhost:3000` (or whichever port `npm start` reports).
From the **Pack** dropdown, choose the **Last Lantern** scenario.

---

## 5. Play a Turn

Type any action in the player-action input and hit **Submit**.  Narration
appears in the transcript.  Behind the scenes:

- `runPlayerTurn` commits a `turn_committed` event to
  `instances/last-lantern/last-lantern-demo/last-lantern/state/events.jsonl`.
- The SSE broadcaster fans the event out to all connected clients.
- Your browser receives the event and appends it to `#event-stream`.

---

## 6. Trigger Image Generation

You can dispatch a portrait wake from the browser dev console or from a Node
script.  Example dev-console call:

```js
await dispatchImageWake({
  instanceDir: "instances/last-lantern/last-lantern-demo",
  worldDir: "instances/last-lantern/last-lantern-demo/world",
  talentName: "portrait-artist",
  prompt: "Mara Underbough, weathered tavernkeep, soft lamplight, late forties, kind eyes, earth-toned wool",
  aspectRatio: "portrait",
  outputTarget: { kind: "portrait", id: "mara-underbough" },
  storyId: "last-lantern",
  cragSlug: "last-lantern-demo",
  sceneId: "last-lantern-tavern",
  currentTurnId: "turn-0001"
});
```

To generate a scene background instead, change `talentName` to
`"background-artist"` and `outputTarget.kind` to `"background"`.

---

## 7. Observe the Pipeline

1. **Belayer** receives the wake mail and routes it to the
   `blyr-last-lantern-demo-portrait-artist` Hermes profile.
2. The `image_generate` tool fires against your configured provider.
3. The resulting image URL/path is written to
   `worlds/last-lantern/assets/portraits/mara-underbough.png`
   (or an instance-scoped variant once path routing lands).
4. A `visual_asset_ready` SSE event is broadcast to all connected clients.
5. The browser `handleStoryEvent` handler detects `event.type ===
   "visual_asset_ready"`, reads `event.inputs.target` (`kind: "portrait"`,
   `id: "mara-underbough"`), and either updates the existing
   `<img id="portrait-mara-underbough">` src or appends a new thumbnail to
   `#portraits-strip`.  The image fades in via the `.asset-fade-in` CSS
   animation.

---

## 8. Inspect Post-Demo Artifacts

| Path | What you'll find |
|---|---|
| `instances/last-lantern/last-lantern-demo/last-lantern/state/events.jsonl` | Chronological event log for the story |
| `instances/last-lantern/last-lantern-demo/last-lantern/state/scene-pulse.json` | Read-model snapshot |
| `~/.hermes/profiles/blyr-last-lantern-demo-mara-underbough/MEMORY.md` | Mara's accumulating private belief layer (grows after several turns) |

---

## 9. Promotion Flow

When you're satisfied with the demo instance, promote any accepted world-state
changes back to the canonical world template:

```
npm run promote -- \
  --eval instances/last-lantern/last-lantern-demo/last-lantern/world-instance-evaluation.json \
  --world last-lantern \
  --accept-all
```

---

## 10. Teardown

Deregister the crag from Belayer and remove the instance directory:

```
belayer uninstall --crag last-lantern-demo
```

Character and art-talent Hermes profiles in `~/.hermes/profiles/` are left in
place so accumulated memory survives across re-materializations.  Delete them
manually if you want a clean slate.

---

## Notes

- **One-instance demo.** Multi-story-per-instance is wired in the data model
  but not exercised by this guide.
- **Image gen requires provider config.** Set `image_gen.provider` in your
  Hermes config (e.g., `fal` API key) before triggering `dispatchImageWake`.
  Without it, the tool call resolves to a no-op placeholder.
- **Real-time UI updates depend on EventSource keep-alive.**  If you see the
  `#event-stream` stop updating, reload the page — the browser will reconnect
  the SSE stream automatically on the next turn.
