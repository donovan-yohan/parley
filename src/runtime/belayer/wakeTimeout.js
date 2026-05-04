/**
 * wakeTimeout.js
 * Polls a response-check function until a response arrives or a timeout elapses.
 */

import { defaultSpawn } from "./belayerProcess.js";

// ─── Default poll function ────────────────────────────────────────────────────

/**
 * Default poll function that shells out to:
 *   belayer events --crag <cragSlug> --client-event-id <clientEventId> --json
 *
 * Returns the parsed response object if one is found, or null otherwise.
 * This is best-effort; the Belayer event-stream API may not be fully stable.
 *
 * @param {{ cragSlug: string, clientEventId: string, belayerCli?: string }} opts
 * @returns {Promise<object | null>}
 */
export async function defaultPollFn({
  cragSlug,
  clientEventId,
  belayerCli = "belayer",
} = {}) {
  try {
    const { exitCode, stdout } = await defaultSpawn(belayerCli, [
      "events",
      "--crag",
      cragSlug,
      "--client-event-id",
      clientEventId,
      "--json",
    ]);

    if (exitCode !== 0 || !stdout.trim()) return null;

    try {
      const parsed = JSON.parse(stdout);
      // When response is an array, take the first element; empty array = no response yet
      if (Array.isArray(parsed)) {
        return parsed.length === 0 ? null : parsed[0];
      }
      return parsed;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

// ─── awaitWakeResponse ────────────────────────────────────────────────────────

/**
 * Polls `pollFn` every `pollIntervalMs` milliseconds.
 *
 * - If `pollFn` returns a non-null value before `timeoutMs`, resolves with that value.
 * - If `timeoutMs` elapses without a response, resolves with
 *   `{ status: "wake_deferred", clientEventId, reason: "timeout" }`.
 * - If `pollFn` throws, the error propagates immediately (not silenced).
 *
 * @param {{
 *   clientEventId: string,
 *   cragSlug?: string,
 *   timeoutMs?: number,
 *   pollIntervalMs?: number,
 *   pollFn: () => Promise<any>
 * }} opts
 * @returns {Promise<any>}
 */
export async function awaitWakeResponse({
  clientEventId,
  cragSlug,
  timeoutMs = 60000,
  pollIntervalMs = 500,
  pollFn,
}) {
  const deadline = Date.now() + timeoutMs;

  while (true) {
    // Call pollFn — errors propagate immediately
    const result = await pollFn({ clientEventId, cragSlug });

    if (result != null) {
      return result;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return { status: "wake_deferred", clientEventId, reason: "timeout" };
    }

    // Wait for the next poll interval, but don't exceed the deadline
    const waitMs = Math.min(pollIntervalMs, remaining);
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    // Re-check deadline after waiting
    if (Date.now() >= deadline) {
      return { status: "wake_deferred", clientEventId, reason: "timeout" };
    }
  }
}
