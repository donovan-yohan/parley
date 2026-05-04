# AGENTS.md — Parley

## Project

Parley is a multi-agent storytelling / roleplaying framework built on top of Belayer + Hermes.

Current goal: build a tiny Twine-inspired local web vertical slice for the Last Lantern scene.

## Core Boundary

Belayer owns generic runtime/control-plane mechanics:

- crags/climbs
- generated talent records
- agent spawn/roster/mail/events/artifacts
- generic gates and completion flow

Parley owns story concepts:

- worlds, scenes, turns, characters, lore, rumors, truth verdicts
- UI/UX
- world bible/library structure
- art style and portrait metadata

Do not make Belayer story-aware. NPCs are Belayer talent profiles — not just
"generated talents used as a character substrate."

Each materialized world instance corresponds to a Belayer crag. Each named NPC
corresponds to a per-talent Hermes profile fork (`blyr-<crag>-<character>`).
NPC private memory accumulates in that profile's `MEMORY.md` and persists across
stories within the same world instance. Characters carry their history.

## Product Decisions

- Every generated NPC becomes reusable by default.
- Character records should include tags like `location`, `role`, `importance`, `faction`, `scene`, `tone`.
- Default generated NPC lifecycle is `resumable`.
- A second LLM-style truth authority judges claims and recommends what is eligible for canon or promotion.
- Distinguish canon, rumor, character belief, unresolved mystery, and author-only hidden truth.
- During play, gameplay agents operate only on materialized world/story instances; deterministic setup may read templates, but agents should not read or mutate templates.
- Significant story events become promotion candidates first. DM/human acceptance promotes them into world-instance canon.
- NPC/character context must be filtered by knowledge scope, relationships, witnessed events, and reluctance-to-share guidance so characters do not become omniscient.
- Start file-backed and inspectable. Honcho/graph are integration seams, not first-slice blockers.
- UI should be a simple text-driven HTML experience inspired by Twine / interactive fiction: transcript + input + next choices + NPC list.
- Image generation is a Belayer talent (`background-artist` / `portrait-artist`) using Hermes `image_generate`. Parley does not call image APIs directly.
- Per-wake tool narrowing enforces actor-vs-GM authority. NPC tools cannot call gm-only tools.
- Story-instance events are append-only at `instances/<world>/<instance>/<story-id>/state/events.jsonl`. Pulse + UI re-render via SSE.

## Relevant Files

- `brainstorm.md` — original product brainstorm.
- `docs/specs/last-lantern-live-storyteller-flow.md` — Belayer live storyteller flow spec.
- `docs/specs/2026-05-01-parley-nightshift-mvp.md` — current MVP/night-shift spec.
- `docs/specs/2026-05-01-nightshift-addendum-stacked-prs-ui-prose.md` — night-shift addendum for stacked PRs, UI, and prose goals.
- `examples/last-lantern/scene.yaml` — current scene seed.
- `examples/last-lantern/artifacts/` — static proof artifacts.
- `scripts/smoke-last-lantern.sh` — current smoke script; known to drift against installed/latest Belayer.
- `docs/plans/2026-05-04-belayer-profile-coupling.md` — full stack roadmap for PRs #21-#25.
- `docs/devlogs/2026-05-04-belayer-profile-coupling-demo.md` — end-to-end demo walkthrough with SSE output, asset manifest inspection, and crag diagnostics.

## Development Guidance

Prefer boring, local-first implementation.

Good stacks:

- TypeScript + Vite + tiny Node API
- or single small Python/Flask/FastAPI app if faster
- or static HTML + minimal local server if enough

Avoid premature framework sludge. No auth, no DB, no deployment, no combat engine.

## Verification Target

The first real slice is accepted when:

1. one command starts a local app
2. player can type `I ask who remembers the old north road.`
3. UI replies with Last Lantern narration involving Mara Underbough
4. Mara appears as a reusable NPC/character with tags
5. turn/world/truth artifacts are persisted
6. tests/smoke scripts pass
7. story-specific concepts remain in Parley, not Belayer
8. materialized instance + Belayer crag are created correctly by `npm run instance:materialize`
9. NPC private memory persists across two `belayer climb` runs in the same crag (check `MEMORY.md` in the talent profile)
10. live UI shows generated portraits/backgrounds (via SSE + image talents) when a Hermes image provider is configured
