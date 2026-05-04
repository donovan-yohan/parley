/**
 * belayerProcess.js
 * Bridge module that shells out to the `belayer` CLI.
 * All public functions accept an injectable `spawnSubprocess` for testability.
 *
 * CLI surface verified via `belayer <cmd> --help` (2026-05-04):
 *   belayer climb start   — creates a session, prints session-id to stdout
 *   belayer message send  — sends a message to a specific agent in a session
 *   belayer message broadcast — broadcasts to all agents in a session
 *   belayer message list  — lists pending messages for a session
 *   belayer logs <id>     — query or follow (--follow) session events
 *   belayer status        — daemon status; exits non-zero + prints "Daemon: offline" when down
 *   belayer auth ensure   — verify/refresh Hermes auth
 *
 * NOTE: None of the above commands support a `--json` flag (verified: all return
 * "Error: unknown flag: --json"). All structured-output parsing uses regex / line
 * scanning. TODO: re-probe after Belayer releases structured output support and
 * remove the regex fallbacks when --json is available.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// ─── Error Classes ────────────────────────────────────────────────────────────

export class BelayerNotInstalledError extends Error {
  constructor(originalError) {
    super(
      "belayer CLI not installed or not on PATH. Install with: go install github.com/donovan-yohan/belayer/cmd/belayer@latest"
    );
    this.name = "BelayerNotInstalledError";
    this.cause = originalError;
  }
}

export class BelayerCommandError extends Error {
  constructor(cmd, exitCode, stderr) {
    super(`belayer ${cmd} failed with exit ${exitCode}: ${stderr}`);
    this.name = "BelayerCommandError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

// ─── Default spawn implementation ────────────────────────────────────────────

/**
 * Spawns a subprocess and collects its output.
 * @param {string} cmd - The command to run.
 * @param {string[]} args - Arguments to pass.
 * @param {{ stdin?: string, env?: NodeJS.ProcessEnv }} options
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
export async function defaultSpawn(cmd, args, { stdin, env } = {}) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(cmd, args, {
        env: env ?? process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      if (err.code === "ENOENT") {
        return reject(new BelayerNotInstalledError(err));
      }
      return reject(err);
    }

    const stdoutChunks = [];
    const stderrChunks = [];

    proc.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new BelayerNotInstalledError(err));
      } else {
        reject(err);
      }
    });

    proc.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });

    proc.stdin.on("error", (err) => {
      if (err.code !== "EPIPE") {
        // re-throw via reject — process is already wired to reject on error
        reject(err);
      }
      // EPIPE silently swallowed; child's exit code carries the real signal
    });

    try {
      if (stdin != null) {
        proc.stdin.write(stdin);
      }
      proc.stdin.end();
    } catch (err) {
      if (err.code !== "EPIPE") throw err;
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs `belayer auth ensure`.
 *
 * Returns `{ ok: false }` on non-zero exit instead of throwing because auth
 * failure is recoverable: callers should surface the stderr to the user and
 * direct them to run `belayer auth` interactively. Sibling functions DO throw
 * on non-zero exit because their callers cannot recover from those failures
 * inline. ENOENT (binary missing) still throws BelayerNotInstalledError via
 * defaultSpawn — callers MUST also check `result.ok` for the auth-rejection case.
 *
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string }>}
 */
export async function belayerAuthEnsure({
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
} = {}) {
  const { exitCode, stdout, stderr } = await spawnSubprocess(
    belayerCli,
    ["auth", "ensure"],
    {}
  );

  return {
    ok: exitCode === 0,
    stdout,
    stderr,
  };
}

/**
 * Runs `belayer crag list --json` and checks whether `cragSlug` appears.
 * Falls back to plain-text parsing if JSON parsing fails.
 * @returns {Promise<boolean>}
 */
export async function belayerCragExists({
  cragSlug,
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
}) {
  const { exitCode, stdout, stderr } = await spawnSubprocess(
    belayerCli,
    ["crag", "list", "--json"],
    {}
  );

  if (exitCode !== 0) {
    throw new BelayerCommandError("crag list --json", exitCode, stderr);
  }

  // Try JSON parsing first
  try {
    const parsed = JSON.parse(stdout);
    // Accept array of objects with a slug/name field, or array of strings
    if (Array.isArray(parsed)) {
      return parsed.some((entry) => {
        if (typeof entry === "string") return entry === cragSlug;
        return entry.slug === cragSlug || entry.name === cragSlug;
      });
    }
    // Accept object with a crags key
    if (parsed && Array.isArray(parsed.crags)) {
      return parsed.crags.some((entry) => {
        if (typeof entry === "string") return entry === cragSlug;
        return entry.slug === cragSlug || entry.name === cragSlug;
      });
    }
  } catch {
    // Fall through to plain-text grep-style parsing
  }

  // Fallback: tokenize each line and check for exact token match (avoids substring false-positives)
  return stdout.split("\n").some((line) => line.split(/\s+/).includes(cragSlug));
}

/**
 * Starts a new Belayer climb (session).
 *
 * Runs `belayer climb start [flags]` and parses the session-id from stdout.
 *
 * Parse strategy: `climb start` has no --json flag (verified). The CLI prints
 * the session-id to stdout, expected to appear either:
 *   (a) as a bare UUID-like token on the first non-empty line, or
 *   (b) in a "session: <id>" / "Session ID: <id>" label format.
 * We try (b) first via regex, then fall back to (a) (first whitespace-free token
 * on the first non-empty line). If both fail the raw stdout is returned as sessionId
 * and a TODO is left for the caller to handle.
 *
 * TODO: When Belayer adds --json to `climb start`, switch to JSON parsing and
 * remove the regex/first-token fallback.
 *
 * @param {object} opts
 * @param {string} [opts.name]                - Climb/session name
 * @param {string} [opts.task]                - Initial task text for the supervisor
 * @param {string} [opts.supervisorProfile]   - Hermes profile for supervisor (default "blyr")
 * @param {string} [opts.workdir]             - Working directory (defaults to cwd)
 * @param {string} [opts.logLevel]            - standard|verbose|trace
 * @param {string} [opts.belayerCli]
 * @param {Function} [opts.spawnSubprocess]
 * @returns {Promise<{ sessionId: string, raw: { stdout: string, stderr: string } }>}
 */
export async function climbStart({
  name,
  task,
  supervisorProfile = "blyr",
  workdir,
  logLevel,
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
}) {
  const args = ["climb", "start"];

  if (name != null) args.push("--name", name);
  if (task != null) args.push("--task", task);
  if (supervisorProfile != null) args.push("--supervisor-profile", supervisorProfile);
  if (workdir != null) args.push("--workdir", workdir);
  if (logLevel != null) args.push("--log-level", logLevel);

  const { exitCode, stdout, stderr } = await spawnSubprocess(belayerCli, args, {});

  if (exitCode !== 0) {
    throw new BelayerCommandError("climb start", exitCode, stderr);
  }

  // Parse strategy: no --json available; try labelled form first, then bare first token.
  // Pattern (b): "session: abc-123", "Session ID: abc-123", "sessionId: abc-123"
  const labelMatch = stdout.match(/session(?:\s+id)?[:\s]+([a-zA-Z0-9][-a-zA-Z0-9_]*)/i);
  if (labelMatch) {
    return { sessionId: labelMatch[1], raw: { stdout, stderr } };
  }

  // Pattern (a): first non-empty line, first token (UUID-shaped: contains hyphens or is alphanumeric)
  const firstToken = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0]
    ?.split(/\s+/)[0];

  if (firstToken) {
    return { sessionId: firstToken, raw: { stdout, stderr } };
  }

  // If we cannot extract anything useful, surface the raw stdout as sessionId so
  // callers can decide how to proceed rather than silently failing.
  return { sessionId: stdout.trim(), raw: { stdout, stderr } };
}

/**
 * Sends a message to a specific agent in a session.
 *
 * Runs `belayer message send "<text>" --session <id> --to <agent> [--interrupt]`.
 *
 * Accepts either an explicit `sessionId` argument or falls back to the
 * `BELAYER_SESSION_ID` environment variable (matching Belayer CLI behaviour).
 *
 * NOTE: `message send` has no --json flag. Output is human-readable confirmation.
 * TODO: switch to JSON parsing when Belayer adds --json to message send.
 *
 * @param {object} opts
 * @param {string} [opts.sessionId]   - Session ID. Falls back to process.env.BELAYER_SESSION_ID.
 * @param {string} opts.to            - Recipient agent ID (required)
 * @param {string} opts.text          - Message text (required)
 * @param {boolean} [opts.interrupt]  - Send as an interrupt (default false)
 * @param {string} [opts.belayerCli]
 * @param {Function} [opts.spawnSubprocess]
 * @returns {Promise<{ ok: boolean, raw: { stdout: string, stderr: string } }>}
 */
export async function messageSend({
  sessionId,
  to,
  text,
  interrupt = false,
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
}) {
  const resolvedSessionId = sessionId ?? process.env.BELAYER_SESSION_ID;
  const args = ["message", "send", text, "--session", resolvedSessionId, "--to", to];

  if (interrupt) args.push("--interrupt");

  const { exitCode, stdout, stderr } = await spawnSubprocess(belayerCli, args, {});

  if (exitCode !== 0) {
    throw new BelayerCommandError("message send", exitCode, stderr);
  }

  return { ok: true, raw: { stdout, stderr } };
}

/**
 * Broadcasts a message to all agents in a session.
 *
 * Runs `belayer message broadcast "<text>" --session <id>`.
 *
 * Accepts either an explicit `sessionId` argument or falls back to the
 * `BELAYER_SESSION_ID` environment variable (matching Belayer CLI behaviour).
 *
 * NOTE: `message broadcast` has no --json flag.
 * TODO: switch to JSON parsing when Belayer adds --json to message broadcast.
 *
 * @param {object} opts
 * @param {string} [opts.sessionId]  - Session ID. Falls back to process.env.BELAYER_SESSION_ID.
 * @param {string} opts.text         - Message text (required)
 * @param {string} [opts.belayerCli]
 * @param {Function} [opts.spawnSubprocess]
 * @returns {Promise<{ ok: boolean, raw: { stdout: string, stderr: string } }>}
 */
export async function messageBroadcast({
  sessionId,
  text,
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
}) {
  const resolvedSessionId = sessionId ?? process.env.BELAYER_SESSION_ID;
  const args = ["message", "broadcast", text, "--session", resolvedSessionId];

  const { exitCode, stdout, stderr } = await spawnSubprocess(belayerCli, args, {});

  if (exitCode !== 0) {
    throw new BelayerCommandError("message broadcast", exitCode, stderr);
  }

  return { ok: true, raw: { stdout, stderr } };
}

/**
 * Lists pending messages for a session.
 *
 * Runs `belayer message list --session <id>`.
 *
 * Accepts either an explicit `sessionId` argument or falls back to the
 * `BELAYER_SESSION_ID` environment variable (matching Belayer CLI behaviour).
 *
 * Parse strategy: `message list` has no --json flag (verified). Output is
 * human-readable. We attempt JSON.parse first in case the CLI silently emits
 * JSON; on failure we split on newlines and return each non-empty line as a
 * string entry. Callers should treat the returned array as opaque strings until
 * Belayer adds --json and we can switch to structured parsing.
 *
 * TODO: When Belayer adds --json to `message list`, switch to JSON parsing and
 * return typed message objects instead of raw strings.
 *
 * @param {object} opts
 * @param {string} [opts.sessionId]  - Session ID. Falls back to process.env.BELAYER_SESSION_ID.
 * @param {string} [opts.belayerCli]
 * @param {Function} [opts.spawnSubprocess]
 * @returns {Promise<Array<string | object>>} Array of pending messages
 */
export async function messageList({
  sessionId,
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
}) {
  const resolvedSessionId = sessionId ?? process.env.BELAYER_SESSION_ID;
  const args = ["message", "list", "--session", resolvedSessionId];

  const { exitCode, stdout, stderr } = await spawnSubprocess(belayerCli, args, {});

  if (exitCode !== 0) {
    throw new BelayerCommandError("message list", exitCode, stderr);
  }

  // Optimistic JSON parse — in case CLI starts emitting JSON without us noticing
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to line-by-line
  }

  // Plain-text fallback: one message per non-empty line
  return stdout.split("\n").filter((line) => line.trim().length > 0);
}

/**
 * Queries session logs (non-streaming).
 *
 * Runs `belayer logs <session-id> --format ndjson [flags]`.
 *
 * Each stdout line is a JSON object (ndjson). Empty lines and parse failures
 * are skipped. `ndjson` is the most machine-friendly format offered by the CLI
 * (verified via --help: "pretty|ndjson", with "json" accepted as alias for ndjson).
 *
 * @param {object} opts
 * @param {string} opts.sessionId          - Session ID (required)
 * @param {string} [opts.agent]            - Filter events by agent name
 * @param {string} [opts.typePrefix]       - Filter by type prefix (e.g. "bridge:")
 * @param {string} [opts.since]            - Show events from last duration (e.g. "10m")
 * @param {number} [opts.tail]             - Limit backfill to last N matching events
 * @param {string} [opts.tier]             - Cap events at log tier (standard|verbose|trace)
 * @param {string} [opts.format]           - Output format (default "ndjson")
 * @param {string} [opts.belayerCli]
 * @param {Function} [opts.spawnSubprocess]
 * @returns {Promise<object[]>} Array of parsed event objects
 */
export async function logsQuery({
  sessionId,
  agent,
  typePrefix,
  since,
  tail,
  tier,
  format = "ndjson",
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
}) {
  const args = ["logs", sessionId, "--format", format];

  if (agent != null) args.push("--agent", agent);
  if (typePrefix != null) args.push("--type", typePrefix);
  if (since != null) args.push("--since", since);
  if (tail != null) args.push("--tail", String(tail));
  if (tier != null) args.push("--tier", tier);

  const { exitCode, stdout, stderr } = await spawnSubprocess(belayerCli, args, {});

  if (exitCode !== 0) {
    throw new BelayerCommandError("logs", exitCode, stderr);
  }

  // Parse ndjson: one JSON object per line; skip empty lines and unparseable lines
  const events = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines (e.g. trailing banner text from pretty format bleed-through)
    }
  }

  return events;
}

/**
 * Follows session logs in real-time via SSE.
 *
 * Spawns `belayer logs <session-id> --follow --format ndjson [flags]` and
 * streams stdout line-by-line. Each line is parsed as JSON and passed to `onEvent`.
 * Empty lines and parse failures are silently skipped (SSE heartbeats, banners).
 *
 * The returned Promise resolves when:
 *   - The child process exits naturally, OR
 *   - The provided AbortSignal fires (child is killed, then Promise resolves).
 *
 * Note: `logsFollow` uses `spawn` directly (not `defaultSpawn`) because it
 * requires streaming access to stdout rather than buffering the full output.
 * The `belayerCli` parameter is still injectable; there is no `spawnSubprocess`
 * param here because the streaming interface differs from the buffered interface.
 *
 * @param {object} opts
 * @param {string} opts.sessionId          - Session ID (required)
 * @param {string} [opts.agent]            - Filter events by agent name
 * @param {string} [opts.typePrefix]       - Filter by type prefix (e.g. "bridge:")
 * @param {Function} opts.onEvent          - Called with each parsed event object
 * @param {AbortSignal} [opts.signal]      - When aborted, kills child and resolves
 * @param {string} [opts.belayerCli]
 */
export async function logsFollow({
  sessionId,
  agent,
  typePrefix,
  onEvent,
  signal,
  belayerCli = "belayer",
}) {
  const args = ["logs", sessionId, "--follow", "--format", "ndjson"];

  if (agent != null) args.push("--agent", agent);
  if (typePrefix != null) args.push("--type", typePrefix);

  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(belayerCli, args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      if (err.code === "ENOENT") {
        return reject(new BelayerNotInstalledError(err));
      }
      return reject(err);
    }

    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new BelayerNotInstalledError(err));
      } else {
        reject(err);
      }
    });

    // Stream stdout line-by-line; parse each as JSON and call onEvent
    const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        onEvent(JSON.parse(trimmed));
      } catch {
        // Skip malformed lines (SSE heartbeats, banner text, etc.)
      }
    });

    proc.on("close", () => resolve());

    // Abort signal: kill the child and let the close event resolve the promise
    if (signal) {
      if (signal.aborted) {
        proc.kill();
      } else {
        signal.addEventListener("abort", () => proc.kill(), { once: true });
      }
    }
  });
}

/**
 * Checks whether the Belayer daemon is running.
 *
 * Strategy: run `belayer status`.
 *   - Exit 0 + stdout not containing negative keywords → running: true
 *   - Non-zero exit or stdout containing "offline" / "stopped" / "not running" /
 *     "inactive" → running: false
 *
 * Probe result (2026-05-04): `belayer status` outputs "Daemon: offline\n" and
 * exits with code 1 when the daemon is not running. When running, exit code is
 * expected to be 0 with a positive status message.
 *
 * @param {object} [opts]
 * @param {string} [opts.belayerCli]
 * @param {Function} [opts.spawnSubprocess]
 * @returns {Promise<{ running: boolean, raw: { stdout: string, stderr: string } }>}
 */
export async function daemonStatus({
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
} = {}) {
  const { exitCode, stdout, stderr } = await spawnSubprocess(
    belayerCli,
    ["status"],
    {}
  );

  const lowerStdout = stdout.toLowerCase();
  const lowerStderr = stderr.toLowerCase();
  const negativeKeywords = ["offline", "stopped", "not running", "inactive"];
  const hasNegative = negativeKeywords.some(
    (kw) => lowerStdout.includes(kw) || lowerStderr.includes(kw)
  );

  const running = exitCode === 0 && !hasNegative;

  return { running, raw: { stdout, stderr } };
}
