/**
 * belayerProcess.js
 * Bridge module that shells out to the `belayer` CLI.
 * All public functions accept an injectable `spawnSubprocess` for testability.
 */

import { spawn } from "node:child_process";

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
 * Runs `belayer mail send` piping body to stdin.
 * @returns {Promise<{ ok: boolean, messageId: string | null, stdout: string, stderr: string }>}
 */
export async function belayerMailSend({
  cragSlug,
  talentName,
  body,
  clientEventId,
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
}) {
  const args = [
    "mail",
    "send",
    "--crag",
    cragSlug,
    "--to",
    talentName,
    "--client-event-id",
    clientEventId,
  ];

  const { exitCode, stdout, stderr } = await spawnSubprocess(belayerCli, args, {
    stdin: body,
  });

  if (exitCode !== 0) {
    throw new BelayerCommandError("mail send", exitCode, stderr);
  }

  // Try to extract a messageId from JSON output
  let messageId = null;
  try {
    const parsed = JSON.parse(stdout);
    messageId = parsed.messageId ?? parsed.message_id ?? parsed.id ?? null;
  } catch {
    // No JSON; messageId remains null
  }

  return {
    ok: true,
    messageId,
    stdout,
    stderr,
  };
}

/**
 * Runs `belayer status` to check if the daemon is running.
 * Exit code 0 with stdout indicating running → { running: true }.
 * Non-zero exit or stdout indicating stopped → { running: false }.
 * @returns {Promise<{ running: boolean, stdout: string, stderr: string }>}
 */
export async function belayerDaemonStatus({
  belayerCli = "belayer",
  spawnSubprocess = defaultSpawn,
} = {}) {
  const { exitCode, stdout, stderr } = await spawnSubprocess(
    belayerCli,
    ["status"],
    {}
  );

  // Daemon considered running if exit code is 0 and stdout doesn't say stopped/not running
  const lowerStdout = stdout.toLowerCase();
  const running =
    exitCode === 0 &&
    !lowerStdout.includes("stopped") &&
    !lowerStdout.includes("not running") &&
    !lowerStdout.includes("inactive");

  return { running, stdout, stderr };
}
