/**
 * sessionManager.js
 *
 * Singleton-ish module that maps (worldInstanceId, storyId) → live Belayer
 * climb session. Tracks which agents are alive in each session.
 *
 * One climb per (worldInstanceId, storyId) pair — subsequent calls to
 * ensureSession are idempotent and return the existing session record.
 */

import { climbStart, messageSend, daemonStatus } from "./belayerProcess.js";
import { validateProfileNameBudget } from "../instances/profileNameBudget.js";

// ─── Internal State ───────────────────────────────────────────────────────────

/**
 * Maps "worldInstanceId::storyId" → session record.
 * @type {Map<string, { sessionId: string, supervisorProfile: string, agents: Set<string>, climbStartedAt: Date }>}
 */
const sessionsByKey = new Map();

// ─── Private Helpers ──────────────────────────────────────────────────────────

function makeKey(worldInstanceId, storyId) {
  return `${worldInstanceId}::${storyId}`;
}

// ─── Error Classes ────────────────────────────────────────────────────────────

export class BelayerDaemonNotRunningError extends Error {
  constructor() {
    super(
      "Belayer daemon is not running. Start it with `belayer daemon` in another terminal."
    );
    this.name = "BelayerDaemonNotRunningError";
  }
}

export class SessionNotStartedError extends Error {
  constructor(worldInstanceId, storyId) {
    super(
      `No active Belayer session for ${worldInstanceId}::${storyId}. Call ensureSession first.`
    );
    this.name = "SessionNotStartedError";
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensure a Belayer climb session is live for this story instance. Idempotent —
 * subsequent calls with same (worldInstanceId, storyId) return the existing
 * session.
 *
 * @param {object} opts
 * @param {string} opts.worldInstanceId
 * @param {string} opts.storyId
 * @param {string} opts.cragSlug              - same as worldInstanceId per PR #22 design
 * @param {string} [opts.supervisorTalent]    - which talent acts as the climb supervisor (default: "storyteller")
 * @param {string} [opts.workdir]             - belayer climb start --workdir
 * @param {string} [opts.initialTask]         - text passed to climb start --task
 * @param {Function} [opts.climbStartFn]      - injectable for tests (default = belayerProcess.climbStart)
 * @param {Function} [opts.daemonStatusFn]    - injectable for tests
 * @returns {Promise<{ sessionId: string, supervisorProfile: string, agents: Set<string>, alreadyExisted: boolean }>}
 */
export async function ensureSession({
  worldInstanceId,
  storyId,
  cragSlug,
  supervisorTalent = "storyteller",
  workdir,
  initialTask,
  climbStartFn = climbStart,
  daemonStatusFn = daemonStatus,
}) {
  const key = makeKey(worldInstanceId, storyId);

  // 1. Idempotency: return existing session if present
  if (sessionsByKey.has(key)) {
    return { ...sessionsByKey.get(key), alreadyExisted: true };
  }

  // 2. Daemon-down preflight
  const status = await daemonStatusFn();
  if (!status.running) {
    throw new BelayerDaemonNotRunningError();
  }

  // 3. Compute and validate supervisor profile name
  const profileResult = validateProfileNameBudget(cragSlug, supervisorTalent);
  if (!profileResult.ok) {
    const messages = profileResult.errors.map((e) => e.message).join("; ");
    throw new Error(`Profile name budget exceeded: ${messages}`);
  }
  const supervisorProfile = profileResult.profileName;

  // 4. Start the climb
  const { sessionId } = await climbStartFn({
    name: `parley-${worldInstanceId}-${storyId}`,
    task: initialTask,
    supervisorProfile,
    workdir,
  });

  // 5. Store session record
  const session = {
    sessionId,
    supervisorProfile,
    agents: new Set([supervisorTalent]),
    climbStartedAt: new Date(),
  };
  sessionsByKey.set(key, session);

  // 6. Return result
  return { ...session, alreadyExisted: false };
}

/**
 * Send a message to an agent in the active session. If the agent isn't in
 * the session's agent roster, throws a clear error.
 *
 * @param {object} opts
 * @param {string} opts.worldInstanceId
 * @param {string} opts.storyId
 * @param {string} opts.to                  - agent name to send to
 * @param {string} opts.text                - message text
 * @param {boolean} [opts.interrupt]        - send as interrupt (default false)
 * @param {Function} [opts.messageSendFn]   - injectable for tests
 * @returns {Promise<*>} result from messageSendFn
 */
export async function sendToAgent({
  worldInstanceId,
  storyId,
  to,
  text,
  interrupt = false,
  messageSendFn = messageSend,
}) {
  const key = makeKey(worldInstanceId, storyId);

  // 1. Look up session
  const session = sessionsByKey.get(key);
  if (!session) {
    throw new SessionNotStartedError(worldInstanceId, storyId);
  }

  // 2. Verify agent is in roster
  if (!session.agents.has(to)) {
    throw new Error(
      `agent \`${to}\` not in session \`${session.sessionId}\` roster; spawn first via climb config`
    );
  }

  // 3. Send message
  return messageSendFn({ sessionId: session.sessionId, to, text, interrupt });
}

/**
 * Mark an agent as alive in the session. Called by callers that have other
 * means of spawning agents (e.g., via belayer climb config or direct bridge
 * spawn). The session manager just tracks the roster.
 *
 * @param {object} opts
 * @param {string} opts.worldInstanceId
 * @param {string} opts.storyId
 * @param {string} opts.agentName
 */
export function registerAgent({ worldInstanceId, storyId, agentName }) {
  const key = makeKey(worldInstanceId, storyId);
  const session = sessionsByKey.get(key);
  if (!session) {
    throw new SessionNotStartedError(worldInstanceId, storyId);
  }
  session.agents.add(agentName);
}

/**
 * Look up the session record. Returns null if no session for this key.
 *
 * @param {object} opts
 * @param {string} opts.worldInstanceId
 * @param {string} opts.storyId
 * @returns {{ sessionId: string, supervisorProfile: string, agents: Set<string>, climbStartedAt: Date } | null}
 */
export function getSession({ worldInstanceId, storyId }) {
  const key = makeKey(worldInstanceId, storyId);
  return sessionsByKey.get(key) ?? null;
}

/**
 * Forget a session (does NOT terminate the climb on Belayer's side — caller
 * should run `belayer climb stop` or equivalent). Intended for test cleanup.
 */
export function _resetForTests() {
  sessionsByKey.clear();
}
