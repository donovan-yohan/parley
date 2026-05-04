/**
 * belayerTruthJudge.js
 *
 * Live truth-judge. Sends the proposed turn (narration + proposed_facts +
 * handled_rejected_claims) to the truth-judge agent in the active climb,
 * awaits a structured verdict response.
 *
 * All Belayer side-effects are injected for testability:
 *   - sendFn: sends a message to the truth-judge agent
 *   - followFn: streams logs from the session (belayerProcess.logsFollow)
 *
 * Safe failure mode: if the judge times out or emits unparseable output,
 * judgeTurn returns a pass verdict with all arrays empty so a flaky judge
 * does not crash gameplay.
 */

import { logsFollow } from "../belayer/belayerProcess.js";

/**
 * Placeholder sendToAgent — replaced by the real sessionManager when it lands
 * in a later wave. The function signature matches what Wave C's sessionManager
 * will export so this import only needs a path swap, not a refactor.
 *
 * Callers inject sendFn in tests; production callers will inject the real one
 * from sessionManager once that module exists.
 *
 * @param {object} opts
 * @param {string} opts.worldInstanceId
 * @param {string} opts.storyId
 * @param {string} opts.to
 * @param {string} opts.text
 * @returns {Promise<{ sessionId: string }>}
 */
async function _defaultSendToAgent({ worldInstanceId, storyId, to, text }) {
  // Will be replaced by the real sessionManager.sendToAgent in Wave C.
  // For now, surface a clear error so integration callers fail fast.
  throw new Error(
    "belayerTruthJudge: sendToAgent is not yet wired to a real session manager. " +
    "Inject a real sendFn (or the sessionManager.sendToAgent) before using in production."
  );
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Creates a live truth-judge function that talks to the truth-judge Belayer agent.
 *
 * @param {object} opts
 * @param {string} opts.worldInstanceId
 * @param {string} opts.storyId
 * @param {Function} [opts.sendFn]            - Injected for tests; default is _defaultSendToAgent
 * @param {Function} [opts.followFn]          - Injected for tests; default is logsFollow
 * @param {number}  [opts.responseTimeoutMs]  - Max ms to wait for verdict (default 60 000)
 * @param {string}  [opts.truthJudgeAgentName]
 * @returns {Function} judgeTurn(context) → Promise<truthVerdict>
 */
export function createBelayerTruthJudge({
  worldInstanceId,
  storyId,
  // Injectable for tests:
  sendFn = _defaultSendToAgent,
  followFn = logsFollow,
  // Configurables:
  responseTimeoutMs = 60_000,
  truthJudgeAgentName = "truth-judge",
} = {}) {
  return async function judgeTurn({
    turnId,
    scene,
    scenario,
    playerAction,
    narration,
    characters,
    proposedFacts,
    handledRejectedClaims,
    actionInterpretation,
    detourScene,
    storyConsequence,
    beatRedirect,
    stateDir,
    worldDir,
  }) {
    // 1. Build the structured proposed-turn message body.
    const messageBody = JSON.stringify({
      type: "judge_turn",
      turn_id: turnId,
      scenario_id: scenario?.id,
      scene: { id: scene.id, title: scene.title },
      player_action: playerAction,
      narration,
      proposed_facts: proposedFacts ?? [],
      handled_rejected_claims: handledRejectedClaims ?? [],
      action_interpretation: actionInterpretation ?? null,
      detour_scene: detourScene ?? null,
      story_consequence: storyConsequence ?? null,
      beat_redirect: beatRedirect ?? null,
      characters: (characters ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        knowledgeBoundary: c.knowledgeBoundary,
      })),
    });

    // 2. Send to truth-judge via the injected send function.
    //    sendFn resolves the active session for this worldInstanceId/storyId
    //    and returns { sessionId } so we can follow the right log stream.
    let sessionId;
    try {
      const sendResult = await sendFn({
        worldInstanceId,
        storyId,
        to: truthJudgeAgentName,
        text: messageBody,
      });
      sessionId = sendResult?.sessionId ?? process.env.BELAYER_SESSION_ID;
    } catch (err) {
      // Send failure → safe default
      return _safeDefault(turnId);
    }

    // 3. Await the verdict by following the session logs stream.
    let parsed;
    try {
      parsed = await _collectJudgeResponse({
        followFn,
        sessionId,
        agentName: truthJudgeAgentName,
        timeoutMs: responseTimeoutMs,
      });
    } catch {
      // Timeout or stream error → safe default
      return _safeDefault(turnId);
    }

    // 4. Normalize — fills all required arrays; handles parse failures.
    return _normalizeVerdict(parsed, { turnId });
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Waits for the truth-judge agent to emit a structured verdict via the logs
 * stream. Resolves with the first line that parses as a JSON object containing
 * a `schema_version` of "parley-truth-verdict/v1" OR a `verdict` field.
 *
 * Rejects with a TimeoutError if `timeoutMs` elapses before a verdict arrives.
 *
 * @param {object} opts
 * @param {Function} opts.followFn     - logsFollow-compatible function
 * @param {string}  opts.sessionId     - Belayer session ID to follow
 * @param {string}  opts.agentName     - Filter events by this agent
 * @param {number}  opts.timeoutMs
 * @returns {Promise<object>}          - Parsed verdict object
 */
function _collectJudgeResponse({ followFn, sessionId, agentName, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();

    // Timeout guard
    const timer = setTimeout(() => {
      controller.abort();
      const err = new Error(`truth-judge verdict timeout after ${timeoutMs}ms`);
      err.name = "TimeoutError";
      reject(err);
    }, timeoutMs);

    // Kick off the follow stream; resolve on first valid verdict event
    followFn({
      sessionId,
      agent: agentName,
      signal: controller.signal,
      onEvent(event) {
        const candidate = _extractVerdict(event);
        if (candidate) {
          clearTimeout(timer);
          controller.abort(); // stop the stream
          resolve(candidate);
        }
      },
    }).then(() => {
      // Stream closed without a verdict (process exited cleanly but no match)
      clearTimeout(timer);
      // Reject only if we haven't resolved yet; if abort fired the resolver
      // already ran, so this is a no-op on an already-settled promise.
      reject(new Error("truth-judge log stream ended without a verdict"));
    }).catch((err) => {
      // Ignore abort-induced errors (expected when we kill the stream ourselves)
      if (controller.signal.aborted) {
        return;
      }
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Attempts to extract a truth verdict from a Belayer log event.
 *
 * Belayer events are ndjson objects — the verdict may appear as:
 *   - event.payload / event.data / event.body (parsed JSON object)
 *   - event.text / event.message (raw JSON string the agent emitted)
 *   - event itself (if the agent directly emits the verdict as a top-level event)
 *
 * Returns the parsed verdict object or null if the event doesn't look like one.
 *
 * @param {object} event - A Belayer log event
 * @returns {object|null}
 */
function _extractVerdict(event) {
  // Try each candidate location in priority order
  const candidates = [
    event?.payload,
    event?.data,
    event?.body,
    _tryParseJson(event?.text),
    _tryParseJson(event?.message),
    _tryParseJson(event?.content),
    event,
  ];

  for (const candidate of candidates) {
    if (_looksLikeVerdict(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Returns true if obj has the minimum shape of a truth verdict.
 * We accept "parley-truth-verdict/v1" schema_version OR a `verdict` field
 * with a recognized value so we're robust to slight schema drift.
 */
function _looksLikeVerdict(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (obj.schema_version === "parley-truth-verdict/v1") return true;
  if (
    typeof obj.verdict === "string" &&
    ["pass", "fail", "revise"].includes(obj.verdict) &&
    (obj.turn_id || obj.id)
  ) {
    return true;
  }
  return false;
}

/** Attempt JSON.parse; return null on failure. */
function _tryParseJson(value) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Returns a safe default verdict (pass, all arrays empty).
 * Used when the judge times out or emits unparseable output.
 * This is intentionally permissive — better to let a turn commit
 * with no truth enrichment than to crash gameplay.
 */
function _safeDefault(turnId) {
  return _normalizeVerdict(null, { turnId });
}

/**
 * Normalizes a raw judge response into the exact shape that
 * parleyRuntime.validateTruthVerdict and buildWorldState expect.
 *
 * Required fields per validateTruthVerdict:
 *   id (non-empty string), verdict (pass|revise|fail),
 *   accepted_facts[], rejected_claims[], rumors[], leads[],
 *   character_beliefs[], unresolved[]
 *
 * @param {object|null} raw   - Parsed verdict from the judge (may be null)
 * @param {object}      opts
 * @param {string}      opts.turnId
 * @returns {object}
 */
function _normalizeVerdict(raw, { turnId }) {
  return {
    id: raw?.id ?? `${turnId}-truth`,
    schema_version: "parley-truth-verdict/v1",
    turn_id: turnId,
    verdict: _normalizeVerdictValue(raw?.verdict),
    accepted_facts: Array.isArray(raw?.accepted_facts) ? raw.accepted_facts : [],
    rumors: Array.isArray(raw?.rumors) ? raw.rumors : [],
    leads: Array.isArray(raw?.leads) ? raw.leads : [],
    character_beliefs: Array.isArray(raw?.character_beliefs) ? raw.character_beliefs : [],
    unresolved: Array.isArray(raw?.unresolved) ? raw.unresolved : [],
    rejected_claims: Array.isArray(raw?.rejected_claims) ? raw.rejected_claims : [],
    author_only_hidden_truth: Array.isArray(raw?.author_only_hidden_truth) ? raw.author_only_hidden_truth : [],
  };
}

/** Coerce verdict value to a valid enum member; default to "pass". */
function _normalizeVerdictValue(value) {
  if (value === "fail" || value === "revise") return value;
  return "pass";
}
