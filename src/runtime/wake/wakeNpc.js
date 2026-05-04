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
  belayerMailSend,
  belayerDaemonStatus,
} from "../belayer/belayerProcess.js";
import { awaitWakeResponse as defaultAwaitWakeResponseImpl } from "../belayer/wakeTimeout.js";
import { validateProfileNameBudget } from "../instances/profileNameBudget.js";
import { defaultPollFn } from "../belayer/wakeTimeout.js";

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
 */
const defaultBelayerProcess = {
  mailSend: belayerMailSend,
  daemonStatus: belayerDaemonStatus,
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

/**
 * Wake an NPC in a Belayer crag via mail transport.
 *
 * @param {object} opts
 * @param {string} opts.instanceDir          - Path to the materialized instance dir
 * @param {string} opts.characterId          - Character / talent name (e.g. "mara-underbough")
 * @param {object} opts.wakeEnvelope         - ParleyWake-shaped envelope object
 * @param {object} [opts.belayerProcess]     - Injectable: { mailSend, daemonStatus }
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

  // Step 4: Daemon-down preflight — short-circuit cleanly without dropping mail.
  const daemonStatus = await belayerProcess.daemonStatus();
  if (!daemonStatus.running) {
    return {
      status: "wake_deferred",
      wake_id: validatedEnvelope.wake_id,
      reason: "belayer_daemon_not_running",
    };
  }

  // Step 5: Send mail via Belayer. client_event_id = wake_id for idempotency.
  await belayerProcess.mailSend({
    cragSlug,
    talentName: characterId,
    body: JSON.stringify(validatedEnvelope),
    clientEventId: validatedEnvelope.wake_id,
  });

  // Step 6: Await the wake response.
  const response = await awaitWakeResponse({
    clientEventId: validatedEnvelope.wake_id,
    cragSlug,
    timeoutMs,
  });

  // Step 7: If deferred (timeout etc.), spread wake_id so consumers always see it.
  if (response && response.status === "wake_deferred") {
    return { ...response, wake_id: validatedEnvelope.wake_id };
  }

  // Step 8: Validate the wake result.
  const validatedResult = validateWakeResult(response);
  return validatedResult;
}
