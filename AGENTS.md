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

Do not make Belayer story-aware. Use Belayer generated talents as Parley's character substrate.

## Product Decisions

- Every generated NPC becomes reusable by default.
- Character records should include tags like `location`, `role`, `importance`, `faction`, `scene`, `tone`.
- Default generated NPC lifecycle is `resumable`.
- A second LLM-style truth authority judges what becomes established canon.
- Distinguish canon, rumor, character belief, unresolved mystery, and author-only hidden truth.
- Start file-backed and inspectable. Honcho/graph/image generation are integration seams, not first-slice blockers.
- UI should be a simple text-driven HTML experience inspired by Twine / interactive fiction: transcript + input + next choices + NPC list.

## Relevant Files

- `brainstorm.md` — original product brainstorm.
- `docs/specs/last-lantern-live-storyteller-flow.md` — Belayer live storyteller flow spec.
- `docs/specs/2026-05-01-parley-nightshift-mvp.md` — current MVP/night-shift spec.
- `docs/specs/2026-05-01-nightshift-addendum-stacked-prs-ui-prose.md` — night-shift addendum for stacked PRs, UI, and prose goals.
- `examples/last-lantern/scene.yaml` — current scene seed.
- `examples/last-lantern/artifacts/` — static proof artifacts.
- `scripts/smoke-last-lantern.sh` — current smoke script; known to drift against installed/latest Belayer.

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
