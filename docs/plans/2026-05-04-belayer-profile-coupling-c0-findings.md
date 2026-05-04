# PR #13 — Belayer Process Integration Findings

## Outcome

Wired the Parley runtime to Belayer's process for the wake-transport path. Stack:

- Subprocess bridge (`src/runtime/belayer/belayerProcess.js`): auth ensure, crag exists, mail send, daemon status.
- Wake timeout helper (`src/runtime/belayer/wakeTimeout.js`): poll-with-timeout returning `{ status: "wake_deferred", reason: "timeout" }` on miss.
- Wake handler (`src/runtime/wake/wakeNpc.js`): validates envelope → daemon preflight → mail send (client_event_id = wake_id for idempotency) → await response → validate result.
- Runtime hook (`src/runtime/parleyRuntime.js`): opt-in `wakeResumableNpcs` flag triggers wake fan-out post-turn-commit. Schema validation injected by caller (avoids .ts/.js loader contention).

## Confirmed working

- Subprocess shell-out is reliable when belayer is on PATH.
- ENOENT → typed BelayerNotInstalledError with install instructions.
- Daemon-down preflight short-circuits cleanly with wake_deferred (no mail dropped into the void).
- Mail send shape: `belayer mail send --crag <c> --to <t> --client-event-id <id>` with body piped to stdin. Tested via mock subprocess.
- ParleyWake envelope rejection of missing `current_story_context` is enforced (load-bearing per design D5).

## Known limits

- No actual LLM round-trip in this PR. Smoke (`scripts/smoke-belayer-roundtrip.mjs`, gated on `BELAYER_E2E=1`) proves mail-send + event-poll wiring; LLM-side response loop wires up in PR #15.
- `awaitWakeResponse` uses a stub `pollFn` shelling out to `belayer events --crag <c> --client-event-id <id> --json`. If Belayer doesn't expose that exact subcommand, the production path needs the real Belayer event-stream API (cross-repo coordination).
- `.ts` schemas are not directly importable from `.js` runtime without the tsx loader. Resolved by injecting validators at the call site.

## Cross-repo follow-up

- Verify `belayer events --crag <c> --client-event-id <id> --json` exists. If not, file a Belayer issue.
- Consider a Belayer Go SDK for Node callers to reduce subprocess overhead per wake.
