# Live Playtest — 2026-05-04

First end-to-end attempt at driving Parley turns through the real Belayer + Hermes + Kimi K2.6 stack on `feat/no-mocks-real-belayer` (Waves A + B + C of the no-mocks refactor).

## Goal

Materialize a Last Lantern instance, start a Belayer climb with the storyteller as supervisor, send player turns as JSON envelopes per the SOUL.md contract, capture narration responses, save a transcript.

## What worked

1. **Materialization** (`npm run instance:materialize -- --world last-lantern --as last-lantern-default`) created all five Hermes profile dirs:
   - `blyr-last-lantern-default-mara-underbough` (character)
   - `blyr-last-lantern-default-storyteller` (system)
   - `blyr-last-lantern-default-truth-judge` (system)
   - `blyr-last-lantern-default-background-artist` (art)
   - `blyr-last-lantern-default-portrait-artist` (art)
   Each with its `.belayer-talent.yaml` (`memory_scope: crag`) and SOUL.md correctly written.

2. **Belayer daemon** started cleanly with `belayer daemon --socket ~/.belayer/daemon.sock`. CLI lookups against the standard socket path worked.

3. **Climb start** with `--supervisor-profile blyr-last-lantern-default-storyteller` succeeded — agent spawned, bridge attached.

4. **Round-trip with Kimi K2.6** confirmed once `BELAYER_MODEL` env was set on the daemon. The supervisor responded:
   > "PONG — Supervisor main agent is awake and alive. Model: Kimi K2.6"
   Real Hermes → Nous → Kimi K2.6 round-trip works end-to-end.

## What broke (real architectural gaps)

### Gap 1 — Hermes fork ignores profile-level model config; needs `BELAYER_MODEL` env

**Symptom:** `bridge:failed` with `final_response: None` after every climb start. Request dump showed `"model": ""` in the POST body to Nous, even though the fork's `config.yaml` had `model.default: moonshotai/kimi-k2.6`.

**Root cause:** `hermes_bridge/__main__.py:350` reads model from `os.environ.get("BELAYER_MODEL", "")`. It does NOT consult the Hermes profile's `config.yaml` for the model field. Empty env → empty model in the request → Nous rejects with HTTP 400 "Model parameter is required".

**Workaround for the playtest:** start the daemon with `BELAYER_MODEL=moonshotai/kimi-k2.6 belayer daemon ...`.

**Proper fix needed (cross-repo):**
- Either: `hermes_bridge` reads model from the active profile's `config.yaml#model.default` when `BELAYER_MODEL` is unset.
- OR: Belayer's spawn path reads each talent profile's `.belayer-talent.yaml#model` (not yet a field) and exports it as `BELAYER_MODEL` per agent.
- Parley-side: `materializeTalentProfile` could write a `.belayer-talent.yaml#model` field. But this only helps if Belayer reads it.

Track as a Belayer issue. Until fixed, daemon must be started with the env var, and ALL talents in the crag share the daemon's `BELAYER_MODEL` (no per-talent model selection yet).

### Gap 2 — Belayer `supervisor` role overrides SOUL.md storyteller behavior

**Symptom:** After fixing Gap 1, the climb's supervisor agent responded to player messages by running supervisor-loop tools (`todo`, `belayer_check_mail`) instead of producing a storyteller JSON envelope per the SOUL.md contract. The SOUL.md content is loaded into the system prompt (verified in the request dump) but Belayer's baked-in supervisor role takes precedence.

**Observed events:**
```
bridge:tool_started  tool=todo            input={"todos":[{"content":"Check mailbox for specialist agent updates", ...}]}
bridge:tool_started  tool=belayer_check_mail input={}
bridge:tool_completed tool=belayer_check_mail result_preview="[System] No pending mail."
```

**Root cause:** Belayer's `supervisor` role has hard-coded supervisor coordination tools + a coordination-loop prompt overlay that takes priority over the profile's SOUL.md. The storyteller persona never gets a chance to author a turn — the agent loops on `check_mail` instead.

**Implication:** Parley's design (storyteller IS the climb supervisor, receives player turns, produces JSON narration) does not fit Belayer's current role model. Belayer's supervisor is a coordinator-of-other-agents, not a content author.

**Possible fixes (all need cross-repo coordination):**
- Belayer adds a non-supervisor "story-author" agent kind/role that uses SOUL.md verbatim without supervisor-loop tools.
- OR Belayer's supervisor exposes a hook for "non-coordination" SOUL behaviors (e.g., `mode: author`).
- OR Parley spawns the storyteller as a `kind: side` worker dispatched by a thin generic supervisor (one extra spawn per turn; loses long-lived supervisor session continuity).

**Workaround attempted:** None viable in the playtest window. The supervisor's behavior is structurally baked.

## What's in main vs what shipped on this branch

The first 5-PR stack (#21-#25, merged to main) shipped the **plumbing** — Zod contracts, instance materialization, .belayer-talent.yaml writes, wake schemas, sessionManager, storyteller/truth-judge SOUL.md templates, image-talent design, SSE event stream, indexer.

This branch (`feat/no-mocks-real-belayer`) shipped the **integration** — `belayerProcess` rewritten for the real CLI (`climb start`, `message send`, `logs --follow`), `runPlayerTurn` opt-in `useLiveAuthor`/`useLiveTruthJudge` flags, server `/api/turn` defaults to live mode when an instance is materialized, drop the deterministic mocks from the API path while preserving them for legacy tests.

**The plumbing is correct.** The two gaps above are Belayer-side architectural realities that this stack cannot resolve in code alone.

## Recommended next steps

1. **File Belayer issues** for both gaps (model-config-resolution, non-supervisor SOUL agent role).
2. **Parley-side adaptation while waiting:** consider a "thin supervisor" pattern — Belayer's supervisor remains the coordinator, Parley spawns a `storyteller` side-agent on demand (per-turn), supervisor's only job is to dispatch player turns to storyteller and route the response back. Higher per-turn cost (cold spawn) but works within Belayer's current role model.
3. **OR pivot the demo path** to drive Hermes/Kimi directly via `hermes ask` from within `runPlayerTurn`, bypassing the Belayer climb model entirely. Loses crag-scoped MEMORY persistence (because Hermes-direct doesn't go through the per-talent profile fork). Faster to demo, less faithful to the design.

## Honest assessment

The full no-mocks integration as designed is blocked by Belayer-side gaps that need either upstream fixes or a Parley workaround layer. The Wave A + B + C code is right and ships value (real CLI bridges, real session manager, real factory functions). It's just not yet end-to-end runnable for a story.

The "PONG" round-trip proves the Hermes → Kimi K2.6 path works at the bytes level. The next blocker is the supervisor-role-vs-storyteller-SOUL conflict.
