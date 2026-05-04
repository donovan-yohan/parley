/**
 * belayerStorytellerAuthor.js
 *
 * Live storyteller author. Sends the player turn to the storyteller agent in
 * the active Belayer climb, awaits a structured narration response, and returns
 * a normalized authoredTurn that matches the shape produced by the legacy
 * createScenarioFixtureAuthor (src/runtime/turnAuthor.js).
 *
 * All Belayer side-effects are injected (sendFn, followFn) so this module is
 * fully testable without a running Belayer daemon.
 *
 * Response event contract:
 *   Belayer emits ndjson events on the logs --follow stream. We listen for
 *   events where:
 *     event.agent === agentName  (storyteller)
 *     event.type === "agent:message"
 *     event.role === "assistant"
 *     event.finish_reason === "stop"   (or event.finish_reason absent/null when
 *                                       the event carries a complete content block)
 *   The event's `content` field (string) is the raw JSON payload the storyteller
 *   emitted. When the above event shape is not yet observed from Belayer, we also
 *   accept any event with type "agent:turn_complete" and the matching agent name.
 *
 * TODO: Re-probe once Belayer is running live and update the event-shape
 * constants (STORYTELLER_EVENT_TYPES, isStorytellerResponse) accordingly.
 */

import { messageSend } from "../belayer/belayerProcess.js";
import { logsFollow } from "../belayer/belayerProcess.js";
import { normalizeAuthoredTurn } from "../turnAuthor.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Event types we accept as the storyteller's final response. */
const STORYTELLER_EVENT_TYPES = new Set(["agent:message", "agent:turn_complete"]);

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a live storyteller author that dispatches player turns to a Belayer
 * climb's storyteller agent and awaits a structured JSON narration.
 *
 * @param {object} opts
 * @param {string} opts.worldInstanceId          - The Belayer session/crag ID for this world instance.
 * @param {string} opts.storyId                  - The story ID (used for logging/context).
 * @param {Function} [opts.sendFn]               - Injectable: defaults to belayerProcess.messageSend.
 * @param {Function} [opts.followFn]             - Injectable: defaults to belayerProcess.logsFollow.
 * @param {number}  [opts.responseTimeoutMs]     - Max ms to wait for storyteller (default 60000).
 * @param {string}  [opts.storytellerAgentName]  - Agent name in Belayer (default "storyteller").
 * @returns {Function} authorTurn(opts) => Promise<authoredTurn>
 */
export function createBelayerStorytellerAuthor({
  worldInstanceId,
  storyId,
  // Injectable for tests:
  sendFn = messageSend,
  followFn = logsFollow,
  // Configurables:
  responseTimeoutMs = 60000,
  storytellerAgentName = "storyteller",
} = {}) {
  async function authorTurn({
    scenario,
    scene,
    playerAction,
    characters = [],
    previousWorldState,
    turnId,
  }) {
    // ── 1. Build structured player-turn message ───────────────────────────────
    const messageBody = JSON.stringify({
      type: "player_turn",
      turn_id: turnId,
      scenario: { id: scenario.id, world: scenario.world },
      scene: { id: scene.id, title: scene.title, instance: scene.instance },
      player_action: playerAction,
      characters: characters.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        lifecycle: c.lifecycle,
      })),
      previous_world_state_summary: summarizeWorldState(previousWorldState),
    });

    // ── 2. Send to storyteller via Belayer ────────────────────────────────────
    await sendFn({
      sessionId: worldInstanceId,
      to: storytellerAgentName,
      text: messageBody,
    });

    // ── 3. Await storyteller response via logs --follow ────────────────────────
    let rawContent;
    try {
      rawContent = await collectStorytellerResponse({
        followFn,
        sessionId: worldInstanceId,
        agentName: storytellerAgentName,
        timeoutMs: responseTimeoutMs,
      });
    } catch (err) {
      // Stream-level error (e.g. BelayerNotInstalledError, spawn failure)
      return buildErrorTurn({
        turnId,
        scenario,
        mode: "error",
        message: `Belayer stream error: ${err?.message ?? String(err)}`,
      });
    }

    // ── 4. Timeout sentinel ────────────────────────────────────────────────────
    if (rawContent === null) {
      return buildErrorTurn({
        turnId,
        scenario,
        mode: "timeout",
        message: `Storyteller did not respond within ${responseTimeoutMs}ms`,
      });
    }

    // ── 5. Parse storyteller JSON ─────────────────────────────────────────────
    let parsed;
    try {
      parsed = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
    } catch (parseErr) {
      return buildErrorTurn({
        turnId,
        scenario,
        mode: "error",
        message: `Storyteller produced unparseable output: ${parseErr?.message ?? String(parseErr)}`,
      });
    }

    // ── 6. Map storyteller response → normalizeAuthoredTurn input shape ───────
    const rawTurn = mapStorytellerResponse({ parsed, turnId });

    return normalizeAuthoredTurn({
      authoredTurn: rawTurn,
      turnAuthor: { id: "belayer-storyteller", mode: "live" },
      scenario,
      turnId,
    });
  }

  return {
    id: "belayer-storyteller",
    mode: "live",
    authorTurn,
  };
}

// ─── Helpers (exported for testing) ──────────────────────────────────────────

/**
 * Summarizes the world state to the most recent N entries per category.
 * Returns null when worldState is absent.
 *
 * @param {object|null|undefined} worldState
 * @returns {object|null}
 */
export function summarizeWorldState(worldState) {
  if (!worldState) return null;
  return {
    canon: (worldState.canon ?? []).slice(-5).map((f) => f.text),
    rumors: (worldState.rumors ?? []).slice(-5).map((r) => r.text),
    leads: (worldState.leads ?? []).slice(-5).map((l) => l.text),
    unresolved: (worldState.unresolved ?? []).slice(-3).map((u) => u.text),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns true if the Belayer event looks like the storyteller's final response.
 *
 * Accepted shapes:
 *   { type: "agent:message", agent: agentName, role: "assistant", ... }
 *   { type: "agent:turn_complete", agent: agentName, ... }
 *
 * @param {object} event
 * @param {string} agentName
 * @returns {boolean}
 */
function isStorytellerResponse(event, agentName) {
  if (!event || typeof event !== "object") return false;
  if (event.agent !== agentName) return false;
  if (!STORYTELLER_EVENT_TYPES.has(event.type)) return false;

  if (event.type === "agent:message") {
    // Must be assistant role with a stop finish_reason (or no finish_reason when
    // content is present — some implementations omit it on streaming completion).
    if (event.role !== "assistant") return false;
    if (event.finish_reason != null && event.finish_reason !== "stop") return false;
    if (!event.content) return false;
  }

  return true;
}

/**
 * Extracts the content string from a matching storyteller event.
 *
 * @param {object} event
 * @returns {string}
 */
function extractContent(event) {
  // agent:message → event.content (string or object with .text)
  if (typeof event.content === "string") return event.content;
  if (event.content && typeof event.content.text === "string") return event.content.text;
  // agent:turn_complete → event.output or event.result or stringified event
  if (event.output != null) return typeof event.output === "string" ? event.output : JSON.stringify(event.output);
  if (event.result != null) return typeof event.result === "string" ? event.result : JSON.stringify(event.result);
  return JSON.stringify(event);
}

/**
 * Follows the Belayer log stream for `sessionId`, resolving with the first
 * matching storyteller response content string, or null on timeout.
 *
 * @param {object} opts
 * @param {Function} opts.followFn
 * @param {string} opts.sessionId
 * @param {string} opts.agentName
 * @param {number} opts.timeoutMs
 * @returns {Promise<string|null>}
 */
async function collectStorytellerResponse({ followFn, sessionId, agentName, timeoutMs }) {
  const controller = new AbortController();
  let resolved = false;
  let content = null;

  const timeoutHandle = setTimeout(() => {
    if (!resolved) {
      controller.abort();
    }
  }, timeoutMs);

  try {
    await followFn({
      sessionId,
      agent: agentName,
      signal: controller.signal,
      onEvent: (event) => {
        if (resolved) return;
        if (isStorytellerResponse(event, agentName)) {
          resolved = true;
          content = extractContent(event);
          controller.abort();
        }
      },
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  return content;
}

/**
 * Maps the storyteller's JSON response object to the shape expected by
 * normalizeAuthoredTurn. Handles snake_case → camelCase conversion for
 * optional detour fields.
 *
 * @param {object} opts
 * @param {object} opts.parsed - The parsed storyteller JSON.
 * @param {string} opts.turnId
 * @returns {object} Raw authored turn (pre-normalization).
 */
function mapStorytellerResponse({ parsed, turnId }) {
  return {
    // normalizeAuthoredTurn requires a responseId; derive from turnId
    responseId: parsed.response_id ?? parsed.responseId ?? `storyteller-${turnId}`,
    narration: parsed.narration ?? "",
    nextChoices: parsed.next_choices ?? parsed.nextChoices ?? [],
    proposedFacts: (parsed.proposed_facts ?? parsed.proposedFacts ?? []).map((f) => ({
      id: f.id,
      text: f.text,
      category: f.category,
    })),
    handledRejectedClaims: (parsed.handled_rejected_claims ?? parsed.handledRejectedClaims ?? []).map(
      (c, i) => ({
        id: c.id ?? `rejected-claim-${i + 1}`,
        claim: c.claim ?? c.player_claim ?? "",
        reason: c.reason ?? "",
      })
    ),
    actionInterpretation: parsed.action_interpretation ?? parsed.actionInterpretation ?? null,
    detourScene: parsed.detour_scene ?? parsed.detourScene ?? null,
    storyConsequence: parsed.story_consequence ?? parsed.storyConsequence ?? null,
    beatRedirect: parsed.beat_redirect ?? parsed.beatRedirect ?? null,
    // Pass through authoring metadata; normalizeAuthoredTurn picks up .author + .mode
    author: parsed.authoring?.author_id ?? "storyteller",
    mode: parsed.authoring?.mode ?? "live",
  };
}

/**
 * Builds a minimal error/timeout authored turn without going through
 * normalizeAuthoredTurn (which requires narration + responseId to be non-empty).
 *
 * @param {object} opts
 * @param {string} opts.turnId
 * @param {object} opts.scenario
 * @param {string} opts.mode - "error" | "timeout"
 * @param {string} opts.message
 * @returns {object}
 */
function buildErrorTurn({ turnId, scenario, mode, message }) {
  return {
    responseId: `${mode}-${turnId}`,
    narration: message,
    nextChoices: scenario?.suggestedPlayerIntents ?? [],
    proposedFacts: [],
    handledRejectedClaims: [],
    actionInterpretation: null,
    detourScene: null,
    storyConsequence: null,
    beatRedirect: null,
    authoring: {
      author: "belayer-storyteller",
      mode,
      response_id: `${mode}-${turnId}`,
    },
  };
}
