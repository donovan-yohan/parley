/**
 * wakeNpc.js
 *
 * Wake handler: validates a ParleyWake envelope, performs a daemon-down
 * preflight, sends mail to the Belayer crag, and awaits a wake response.
 *
 * Schema validation is injected by the caller to avoid .ts/.js loader
 * contention in production (tsx loader is required to import .ts from .js).
 *
 * Production callers (CLI, server) import ParleyWakeSchema / ParleyWakeResultSchema
 * via tsx and inject them as validateWake / validateWakeResult.
 * Tests inject the real Zod parsers via tsx-loaded contract imports.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  daemonStatus as belayerDaemonStatusFn,
} from "../belayer/belayerProcess.js";
import {
  awaitWakeResponse as defaultAwaitWakeResponseImpl,
  defaultPollFn,
} from "../belayer/wakeTimeout.js";
import { validateProfileNameBudget } from "../instances/profileNameBudget.js";
import {
  sendToAgent as sessionManagerSendToAgent,
  SessionNotStartedError,
} from "../belayer/sessionManager.js";

// ─── Default validators (stubs — must be replaced by caller) ──────────────────

/**
 * Default validateWake stub. Throws a helpful error if called without injection.
 * Production callers inject ParleyWakeSchema.parse from contracts.
 */
function defaultValidateWake(value) {
  throw new Error(
    "wakeNpc: pass validateWake (e.g., ParleyWakeSchema.parse) — schema validation must be supplied by the caller"
  );
}

/**
 * Default validateWakeResult stub. Throws a helpful error if called without injection.
 * Production callers inject ParleyWakeResultSchema.parse from contracts.
 */
function defaultValidateWakeResult(value) {
  throw new Error(
    "wakeNpc: pass validateWakeResult (e.g., ParleyWakeResultSchema.parse) — schema validation must be supplied by the caller"
  );
}

// ─── Default process object ───────────────────────────────────────────────────

/**
 * Default belayerProcess object wrapping the subprocess bridge.
 * Injectable for tests.
 *
 * Production send: delegates to sessionManager.sendToAgent. The session must
 * have been established (ensureSession) before wakeNpc is called. If no
 * session exists for the (worldInstanceId, storyId) pair, SessionNotStartedError
 * is thrown by sendToAgent.
 *
 * The belayerProcess.sendToAgent signature mirrors sessionManager.sendToAgent
 * so injection is a direct drop-in.
 */
const defaultBelayerProcess = {
  sendToAgent: sessionManagerSendToAgent,
  daemonStatus: belayerDaemonStatusFn,
};

// ─── Default awaitWakeResponse wrapper ───────────────────────────────────────

/**
 * Default awaitWakeResponse — wraps the wakeTimeout helper with the default poll fn.
 */
async function defaultAwaitWakeResponse({ clientEventId, cragSlug, timeoutMs }) {
  return defaultAwaitWakeResponseImpl({
    clientEventId,
    cragSlug,
    timeoutMs,
    pollFn: defaultPollFn,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

// ─── Story context resolver ───────────────────────────────────────────────────

/**
 * Derive (worldInstanceId, storyId) from a materialized instance directory.
 *
 * worldInstanceId = manifest.instance_id (same as crag_slug per PR #22 design)
 * storyId = envelope.current_story_context.story_id
 *
 * Both fields must be present in the manifest and envelope respectively.
 *
 * @param {string} instanceDir
 * @param {string} storyIdFromEnvelope - story_id from the wake envelope's current_story_context
 * @returns {Promise<{ worldInstanceId: string, storyId: string }>}
 */
export async function resolveStoryContextFromInstanceDir(instanceDir, storyIdFromEnvelope) {
  const manifestPath = path.join(instanceDir, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (err) {
    throw new Error(
      `resolveStoryContextFromInstanceDir: failed to read manifest at ${manifestPath}: ${err.message}`
    );
  }

  const worldInstanceId = manifest.instance_id;
  if (!worldInstanceId) {
    throw new Error(
      `resolveStoryContextFromInstanceDir: manifest at ${manifestPath} missing instance_id`
    );
  }

  const storyId = storyIdFromEnvelope;
  if (!storyId) {
    throw new Error(
      "resolveStoryContextFromInstanceDir: storyIdFromEnvelope is required"
    );
  }

  return { worldInstanceId, storyId };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Wake an NPC in a Belayer crag via the session-based messaging transport.
 *
 * The wake envelope (parley-wake/v1) becomes the JSON body of the message
 * sent to the agent via sessionManager.sendToAgent. The session must have
 * been established before calling wakeNpc (call ensureSession from
 * sessionManager first, or the production path in server.js will do it).
 *
 * @param {object} opts
 * @param {string} opts.instanceDir          - Path to the materialized instance dir
 * @param {string} opts.characterId          - Character / talent name (e.g. "mara-underbough")
 * @param {object} opts.wakeEnvelope         - ParleyWake-shaped envelope object
 * @param {object} [opts.belayerProcess]     - Injectable: { sendToAgent, daemonStatus }
 * @param {Function} [opts.awaitWakeResponse] - Injectable: (opts) => Promise<any>
 * @param {Function} [opts.validateWake]     - Injectable: (value) => validatedValue (throws on invalid)
 * @param {Function} [opts.validateWakeResult] - Injectable: (value) => validatedValue (throws on invalid)
 * @param {number} [opts.timeoutMs=60000]    - Poll timeout in milliseconds
 *
 * @returns {Promise<object>} Wake result or wake_deferred object
 */
export async function wakeNpc({
  instanceDir,
  characterId,
  wakeEnvelope,
  belayerProcess = defaultBelayerProcess,
  awaitWakeResponse = defaultAwaitWakeResponse,
  validateWake = defaultValidateWake,
  validateWakeResult = defaultValidateWakeResult,
  timeoutMs = 60000,
}) {
  // Step 1: Validate the wake envelope FIRST — callers cannot bypass current_story_context enforcement.
  const validatedEnvelope = validateWake(wakeEnvelope);

  // Step 2: Read instance manifest and resolve crag_slug.
  const manifestPath = path.join(instanceDir, "manifest.json");
  let manifest;
  try {
    const raw = await readFile(manifestPath, "utf8");
    manifest = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `wakeNpc: failed to read instance manifest at ${manifestPath}: ${error.message}`
    );
  }

  const cragSlug = manifest.crag_slug;
  if (!cragSlug) {
    throw new Error(
      `wakeNpc: manifest at ${manifestPath} is missing crag_slug`
    );
  }

  // Sanity-check: manifest crag must match envelope crag.
  if (cragSlug !== validatedEnvelope.crag_slug) {
    throw new Error(
      `wakeNpc: crag mismatch — manifest crag_slug "${cragSlug}" does not match envelope crag_slug "${validatedEnvelope.crag_slug}"`
    );
  }

  // Step 3: Validate profile name budget (defensive).
  const budgetResult = validateProfileNameBudget(cragSlug, characterId);
  if (!budgetResult.ok) {
    const msgs = budgetResult.errors.map((e) => e.message).join("; ");
    throw new Error(`wakeNpc: profile name budget validation failed: ${msgs}`);
  }

  // Step 4: Daemon-down preflight — short-circuit cleanly without attempting to send.
  const daemonStatus = await belayerProcess.daemonStatus();
  if (!daemonStatus.running) {
    return {
      status: "wake_deferred",
      wake_id: validatedEnvelope.wake_id,
      reason: "belayer_daemon_not_running",
    };
  }

  // Step 5: Resolve session context (worldInstanceId + storyId) from the manifest
  // and the envelope's current_story_context.story_id.
  const worldInstanceId = manifest.instance_id ?? cragSlug;
  const storyId = validatedEnvelope.current_story_context.story_id;

  // Step 6: Send the parley-wake/v1 envelope as a message to the agent via the
  // active Belayer session. The envelope JSON body is the full wake message.
  await belayerProcess.sendToAgent({
    worldInstanceId,
    storyId,
    to: characterId,
    text: JSON.stringify(validatedEnvelope),
  });

  // Step 7: Await the wake response.
  const response = await awaitWakeResponse({
    clientEventId: validatedEnvelope.wake_id,
    cragSlug,
    timeoutMs,
  });

  // Step 8: If deferred (timeout etc.), normalize shape so consumers always see wake_id.
  // The timeout path from awaitWakeResponse uses `clientEventId`; daemon-down path here uses `wake_id`.
  // Surface both for now so downstream consumers (PR #14 pulse, PR #15 UI) don't have to disambiguate.
  if (response && response.status === "wake_deferred") {
    return { ...response, wake_id: validatedEnvelope.wake_id };
  }

  // Step 9: Validate the wake result.
  const validatedResult = validateWakeResult(response);
  return validatedResult;
}
