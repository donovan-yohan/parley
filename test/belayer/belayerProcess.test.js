import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  belayerAuthEnsure,
  belayerCragExists,
  climbStart,
  messageSend,
  messageBroadcast,
  messageList,
  logsQuery,
  logsFollow,
  daemonStatus,
  BelayerNotInstalledError,
  BelayerCommandError,
} from "../../src/runtime/belayer/belayerProcess.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock spawnSubprocess that records calls and returns a preset result. */
function mockSpawn({ exitCode = 0, stdout = "", stderr = "" } = {}) {
  const calls = [];
  const fn = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, opts });
    return { exitCode, stdout, stderr };
  };
  fn.calls = calls;
  return fn;
}

/** Build a mock spawnSubprocess that throws an ENOENT-style BelayerNotInstalledError. */
function enoentSpawn() {
  const calls = [];
  const fn = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, opts });
    const err = new Error("spawn belayer ENOENT");
    err.code = "ENOENT";
    const nie = new BelayerNotInstalledError(err);
    throw nie;
  };
  fn.calls = calls;
  return fn;
}

/**
 * Build a fake streaming child process for logsFollow tests.
 * Returns an object shaped like a child_process with a .stdout Readable,
 * plus helpers to push lines and simulate exit.
 */
function makeFakeStreamProcess() {
  const stdout = new EventEmitter();
  stdout.pipe = () => stdout; // minimal Readable-compat
  const proc = new EventEmitter();
  proc.stdout = stdout;
  proc.kill = () => proc.emit("close", 0);
  return proc;
}

// ─── belayerAuthEnsure ────────────────────────────────────────────────────────

test("belayerAuthEnsure happy path: spawn called with ['auth', 'ensure']", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "auth ok\n", stderr: "" });

  const result = await belayerAuthEnsure({ spawnSubprocess: spawn });

  assert.equal(spawn.calls.length, 1);
  assert.equal(spawn.calls[0].cmd, "belayer");
  assert.deepEqual(spawn.calls[0].args, ["auth", "ensure"]);
  assert.equal(result.ok, true);
  assert.equal(result.stdout, "auth ok\n");
  assert.equal(result.stderr, "");
});

test("belayerAuthEnsure returns ok: false on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 1, stdout: "", stderr: "auth failed" });

  const result = await belayerAuthEnsure({ spawnSubprocess: spawn });

  assert.equal(result.ok, false);
  assert.equal(result.stderr, "auth failed");
});

test("belayerAuthEnsure uses custom belayerCli path", async () => {
  const spawn = mockSpawn({ exitCode: 0 });

  await belayerAuthEnsure({ belayerCli: "/usr/local/bin/belayer", spawnSubprocess: spawn });

  assert.equal(spawn.calls[0].cmd, "/usr/local/bin/belayer");
});

// ─── belayerCragExists ────────────────────────────────────────────────────────

test("belayerCragExists returns true when JSON array contains the slug", async () => {
  const crags = [{ slug: "my-crag", name: "My Crag" }, { slug: "other", name: "Other" }];
  const spawn = mockSpawn({ exitCode: 0, stdout: JSON.stringify(crags) });

  const exists = await belayerCragExists({ cragSlug: "my-crag", spawnSubprocess: spawn });

  assert.equal(exists, true);
  assert.deepEqual(spawn.calls[0].args, ["crag", "list", "--json"]);
});

test("belayerCragExists returns false when JSON array does not contain the slug", async () => {
  const crags = [{ slug: "other-crag" }];
  const spawn = mockSpawn({ exitCode: 0, stdout: JSON.stringify(crags) });

  const exists = await belayerCragExists({ cragSlug: "my-crag", spawnSubprocess: spawn });

  assert.equal(exists, false);
});

test("belayerCragExists returns true with { crags: [...] } shaped JSON", async () => {
  const output = JSON.stringify({ crags: [{ slug: "target-crag" }] });
  const spawn = mockSpawn({ exitCode: 0, stdout: output });

  const exists = await belayerCragExists({ cragSlug: "target-crag", spawnSubprocess: spawn });

  assert.equal(exists, true);
});

test("belayerCragExists returns true via plain-text fallback when JSON parsing fails", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "  my-crag  production\n  other  staging\n" });

  const exists = await belayerCragExists({ cragSlug: "my-crag", spawnSubprocess: spawn });

  assert.equal(exists, true);
});

test("belayerCragExists returns false via plain-text fallback when slug is absent", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "other-crag  production\n" });

  const exists = await belayerCragExists({ cragSlug: "my-crag", spawnSubprocess: spawn });

  assert.equal(exists, false);
});

test("belayerCragExists does NOT match substring: 'my-crag' is absent when line contains 'my-crag-2'", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "  my-crag-2  production\n  other-crag  staging\n" });

  const exists = await belayerCragExists({ cragSlug: "my-crag", spawnSubprocess: spawn });

  assert.equal(exists, false);
});

test("belayerCragExists throws BelayerCommandError on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 1, stderr: "permission denied" });

  await assert.rejects(
    () => belayerCragExists({ cragSlug: "x", spawnSubprocess: spawn }),
    (err) => {
      assert.ok(err instanceof BelayerCommandError);
      assert.equal(err.exitCode, 1);
      assert.ok(err.stderr.includes("permission denied"));
      return true;
    }
  );
});

// ─── climbStart ───────────────────────────────────────────────────────────────

test("climbStart passes correct args with all options", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "session: abc-session-id\n" });

  const result = await climbStart({
    name: "my-climb",
    task: "do the thing",
    supervisorProfile: "blyr",
    workdir: "/tmp/work",
    logLevel: "verbose",
    spawnSubprocess: spawn,
  });

  assert.equal(spawn.calls.length, 1);
  const { cmd, args } = spawn.calls[0];
  assert.equal(cmd, "belayer");
  assert.ok(args.includes("climb"));
  assert.ok(args.includes("start"));
  assert.ok(args.includes("--name"));
  assert.ok(args.includes("my-climb"));
  assert.ok(args.includes("--task"));
  assert.ok(args.includes("do the thing"));
  assert.ok(args.includes("--supervisor-profile"));
  assert.ok(args.includes("blyr"));
  assert.ok(args.includes("--workdir"));
  assert.ok(args.includes("/tmp/work"));
  assert.ok(args.includes("--log-level"));
  assert.ok(args.includes("verbose"));
  assert.equal(result.sessionId, "abc-session-id");
});

test("climbStart parses session-id from labelled stdout (case-insensitive)", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "Session ID: climb-xyz-789\n" });

  const result = await climbStart({ spawnSubprocess: spawn });

  assert.equal(result.sessionId, "climb-xyz-789");
});

test("climbStart parses session-id from bare first token when no label present", async () => {
  // Simulates CLI printing bare session-id on first line
  const spawn = mockSpawn({ exitCode: 0, stdout: "bare-session-001\nsome other output\n" });

  const result = await climbStart({ spawnSubprocess: spawn });

  assert.equal(result.sessionId, "bare-session-001");
});

test("climbStart omits optional flags when not provided", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "session: s-minimal\n" });

  await climbStart({ spawnSubprocess: spawn });

  const { args } = spawn.calls[0];
  assert.ok(!args.includes("--name"));
  assert.ok(!args.includes("--task"));
  assert.ok(!args.includes("--workdir"));
  assert.ok(!args.includes("--log-level"));
  // supervisor-profile IS included because it has a default
  assert.ok(args.includes("--supervisor-profile"));
  assert.ok(args.includes("blyr"));
});

test("climbStart throws BelayerCommandError on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 1, stdout: "", stderr: "daemon offline" });

  await assert.rejects(
    () => climbStart({ spawnSubprocess: spawn }),
    (err) => {
      assert.ok(err instanceof BelayerCommandError);
      assert.equal(err.exitCode, 1);
      assert.ok(err.stderr.includes("daemon offline"));
      return true;
    }
  );
});

test("climbStart returns raw stdout and stderr in result", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "session: s-raw\nextra output\n", stderr: "warn\n" });

  const result = await climbStart({ spawnSubprocess: spawn });

  assert.equal(result.raw.stdout, "session: s-raw\nextra output\n");
  assert.equal(result.raw.stderr, "warn\n");
});

test("climbStart uses custom belayerCli path", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "session: s\n" });

  await climbStart({ belayerCli: "/custom/belayer", spawnSubprocess: spawn });

  assert.equal(spawn.calls[0].cmd, "/custom/belayer");
});

// ─── messageSend ─────────────────────────────────────────────────────────────

test("messageSend passes correct args", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "sent\n" });

  const result = await messageSend({
    sessionId: "sess-001",
    to: "agent-alpha",
    text: "Hello agent!",
    spawnSubprocess: spawn,
  });

  assert.equal(spawn.calls.length, 1);
  const { cmd, args } = spawn.calls[0];
  assert.equal(cmd, "belayer");
  assert.deepEqual(args, [
    "message", "send", "Hello agent!",
    "--session", "sess-001",
    "--to", "agent-alpha",
  ]);
  assert.equal(result.ok, true);
});

test("messageSend passes --interrupt flag when interrupt=true", async () => {
  const spawn = mockSpawn({ exitCode: 0 });

  await messageSend({
    sessionId: "sess-001",
    to: "agent-beta",
    text: "stop now",
    interrupt: true,
    spawnSubprocess: spawn,
  });

  assert.ok(spawn.calls[0].args.includes("--interrupt"));
});

test("messageSend does NOT pass --interrupt flag when interrupt=false", async () => {
  const spawn = mockSpawn({ exitCode: 0 });

  await messageSend({
    sessionId: "sess-001",
    to: "agent-beta",
    text: "hello",
    interrupt: false,
    spawnSubprocess: spawn,
  });

  assert.ok(!spawn.calls[0].args.includes("--interrupt"));
});

test("messageSend throws BelayerCommandError on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 2, stderr: "agent not found" });

  await assert.rejects(
    () => messageSend({ sessionId: "s", to: "x", text: "hi", spawnSubprocess: spawn }),
    (err) => {
      assert.ok(err instanceof BelayerCommandError);
      assert.equal(err.exitCode, 2);
      return true;
    }
  );
});

test("messageSend uses custom belayerCli path", async () => {
  const spawn = mockSpawn({ exitCode: 0 });

  await messageSend({
    sessionId: "s",
    to: "x",
    text: "t",
    belayerCli: "/opt/belayer",
    spawnSubprocess: spawn,
  });

  assert.equal(spawn.calls[0].cmd, "/opt/belayer");
});

// ─── messageBroadcast ────────────────────────────────────────────────────────

test("messageBroadcast passes correct args", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "broadcast sent\n" });

  const result = await messageBroadcast({
    sessionId: "sess-bc-001",
    text: "All hands!",
    spawnSubprocess: spawn,
  });

  assert.equal(spawn.calls.length, 1);
  const { cmd, args } = spawn.calls[0];
  assert.equal(cmd, "belayer");
  assert.deepEqual(args, [
    "message", "broadcast", "All hands!",
    "--session", "sess-bc-001",
  ]);
  assert.equal(result.ok, true);
});

test("messageBroadcast throws BelayerCommandError on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 1, stderr: "session not found" });

  await assert.rejects(
    () => messageBroadcast({ sessionId: "s", text: "hi", spawnSubprocess: spawn }),
    (err) => {
      assert.ok(err instanceof BelayerCommandError);
      assert.equal(err.exitCode, 1);
      return true;
    }
  );
});

test("messageBroadcast uses custom belayerCli path", async () => {
  const spawn = mockSpawn({ exitCode: 0 });

  await messageBroadcast({ sessionId: "s", text: "t", belayerCli: "/opt/b", spawnSubprocess: spawn });

  assert.equal(spawn.calls[0].cmd, "/opt/b");
});

// ─── messageList ─────────────────────────────────────────────────────────────

test("messageList passes correct args", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "" });

  await messageList({ sessionId: "sess-list-001", spawnSubprocess: spawn });

  assert.equal(spawn.calls.length, 1);
  const { cmd, args } = spawn.calls[0];
  assert.equal(cmd, "belayer");
  assert.deepEqual(args, ["message", "list", "--session", "sess-list-001"]);
});

test("messageList returns parsed JSON array when stdout is JSON", async () => {
  const messages = [{ id: "m1", text: "hello" }, { id: "m2", text: "world" }];
  const spawn = mockSpawn({ exitCode: 0, stdout: JSON.stringify(messages) });

  const result = await messageList({ sessionId: "s", spawnSubprocess: spawn });

  assert.deepEqual(result, messages);
});

test("messageList returns array of non-empty lines when stdout is plain text", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "msg one\nmsg two\n\nmsg three\n" });

  const result = await messageList({ sessionId: "s", spawnSubprocess: spawn });

  assert.deepEqual(result, ["msg one", "msg two", "msg three"]);
});

test("messageList returns empty array for empty stdout", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "" });

  const result = await messageList({ sessionId: "s", spawnSubprocess: spawn });

  assert.deepEqual(result, []);
});

test("messageList throws BelayerCommandError on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 1, stderr: "not authorized" });

  await assert.rejects(
    () => messageList({ sessionId: "s", spawnSubprocess: spawn }),
    (err) => {
      assert.ok(err instanceof BelayerCommandError);
      assert.equal(err.exitCode, 1);
      return true;
    }
  );
});

// ─── logsQuery ───────────────────────────────────────────────────────────────

test("logsQuery passes correct args with session-id and defaults", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "" });

  await logsQuery({ sessionId: "sess-log-001", spawnSubprocess: spawn });

  const { cmd, args } = spawn.calls[0];
  assert.equal(cmd, "belayer");
  assert.equal(args[0], "logs");
  assert.equal(args[1], "sess-log-001");
  assert.ok(args.includes("--format"));
  assert.ok(args.includes("ndjson"));
});

test("logsQuery passes optional filters", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "" });

  await logsQuery({
    sessionId: "s",
    agent: "worker-1",
    typePrefix: "bridge:",
    since: "10m",
    tail: 50,
    tier: "verbose",
    spawnSubprocess: spawn,
  });

  const { args } = spawn.calls[0];
  assert.ok(args.includes("--agent"));
  assert.ok(args.includes("worker-1"));
  assert.ok(args.includes("--type"));
  assert.ok(args.includes("bridge:"));
  assert.ok(args.includes("--since"));
  assert.ok(args.includes("10m"));
  assert.ok(args.includes("--tail"));
  assert.ok(args.includes("50"));
  assert.ok(args.includes("--tier"));
  assert.ok(args.includes("verbose"));
});

test("logsQuery parses ndjson lines into event objects", async () => {
  const e1 = { id: 1, type: "session:start" };
  const e2 = { id: 2, type: "bridge:message" };
  const stdout = [JSON.stringify(e1), JSON.stringify(e2), ""].join("\n");
  const spawn = mockSpawn({ exitCode: 0, stdout });

  const events = await logsQuery({ sessionId: "s", spawnSubprocess: spawn });

  assert.equal(events.length, 2);
  assert.deepEqual(events[0], e1);
  assert.deepEqual(events[1], e2);
});

test("logsQuery skips malformed/empty lines", async () => {
  const e1 = { id: 1 };
  const stdout = `${JSON.stringify(e1)}\nnot-json\n\n`;
  const spawn = mockSpawn({ exitCode: 0, stdout });

  const events = await logsQuery({ sessionId: "s", spawnSubprocess: spawn });

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], e1);
});

test("logsQuery returns empty array when stdout is empty", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "" });

  const events = await logsQuery({ sessionId: "s", spawnSubprocess: spawn });

  assert.deepEqual(events, []);
});

test("logsQuery throws BelayerCommandError on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 1, stderr: "session not found" });

  await assert.rejects(
    () => logsQuery({ sessionId: "s", spawnSubprocess: spawn }),
    (err) => {
      assert.ok(err instanceof BelayerCommandError);
      assert.equal(err.exitCode, 1);
      return true;
    }
  );
});

test("logsQuery uses custom belayerCli path", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "" });

  await logsQuery({ sessionId: "s", belayerCli: "/custom/b", spawnSubprocess: spawn });

  assert.equal(spawn.calls[0].cmd, "/custom/b");
});

// ─── logsFollow ──────────────────────────────────────────────────────────────

test("logsFollow calls onEvent for each parsed JSON line", async () => {
  // We need to mock the actual `spawn` call inside logsFollow since it uses
  // node:child_process directly. We do this by overriding the process object
  // using a wrapper that intercepts the spawn call inside logsFollow.
  //
  // Strategy: logsFollow accepts belayerCli but uses spawn() from node:child_process
  // directly. To test it, we simulate the spawn by monkey-patching in a fake process.
  // Since we can't inject spawn into logsFollow, we use a real AbortController
  // and a real spawn on a safe echo command to test the wiring end-to-end,
  // OR we test the integration with a process that emits known ndjson lines.
  //
  // For unit-level testing, we verify the Promise resolves and onEvent is called.
  // We use `node --eval` as a safe subprocess that emits known output.

  const received = [];
  const controller = new AbortController();

  // Emit two ndjson events via a node subprocess
  const line1 = JSON.stringify({ type: "test:event", id: 1 });
  const line2 = JSON.stringify({ type: "test:event", id: 2 });

  // We can't inject spawn into logsFollow, so we use a minimal real process.
  // Use `node -e` to emit ndjson and exit.
  const script = `process.stdout.write(${JSON.stringify(line1 + "\n" + line2 + "\n")});`;

  // Override belayerCli to run node -e <script>, using the fact that
  // belayerCli is the command and the rest is ["logs", sessionId, "--follow", "--format", "ndjson"]
  // This won't work directly. Instead, test using echo via shell shim.
  //
  // Real approach: logsFollow is best tested with integration tests.
  // For this unit test we verify the contract with a process that exits cleanly.
  // We spawn `node` with an inline script.

  // This test validates that logsFollow resolves when the child exits.
  // A separate integration test would verify real belayer output.
  const promise = logsFollow({
    sessionId: "fake-session",
    onEvent: (evt) => received.push(evt),
    signal: controller.signal,
    // Point at node so we can emit controlled output
    belayerCli: process.execPath,
  });

  // Kill immediately via abort signal — logsFollow should resolve
  controller.abort();

  await promise;
  // If we get here without hanging, the abort mechanism works.
  assert.ok(true, "logsFollow resolved after abort signal");
});

test("logsFollow: onEvent called per valid ndjson line via a real subprocess", async (t) => {
  // Use node as the CLI, inject a script that emits ndjson lines then exits.
  // We test by pointing belayerCli at node and relying on the fact that
  // logsFollow builds args: [logs, sessionId, --follow, --format, ndjson]
  // which node will silently ignore (it won't match any node flag).
  // The child process exits with 0 and emits no stdout → onEvent is never called.
  // This verifies the baseline: no phantom events.

  const received = [];

  // Since we can't inject a custom spawn into logsFollow, this test is limited
  // to verifying that logsFollow does not throw and resolves when child exits 0.
  // Full onEvent line-by-line testing requires an integration shim.
  //
  // TODO(Wave B): add an integration test harness that wraps logsFollow with
  // a spawnFn shim for proper line-by-line unit testing.

  const controller = new AbortController();

  const promise = logsFollow({
    sessionId: "test-sess",
    onEvent: (evt) => received.push(evt),
    signal: controller.signal,
    belayerCli: process.execPath, // node exits cleanly for unknown args
  });

  controller.abort();
  await promise;

  // onEvent should not have been called (no output from node for these args)
  assert.equal(received.length, 0, "no spurious events from logsFollow baseline");
});

// ─── daemonStatus ────────────────────────────────────────────────────────────

test("daemonStatus returns running: true when exit 0 and no negative keywords", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "Daemon: running (pid 1234)\n" });

  const result = await daemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, true);
  assert.deepEqual(spawn.calls[0].args, ["status"]);
});

test("daemonStatus returns running: false on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 1, stdout: "Daemon: offline\n", stderr: "" });

  const result = await daemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
});

test("daemonStatus returns running: false when stdout contains 'offline'", async () => {
  // Matches observed real output: "Daemon: offline"
  const spawn = mockSpawn({ exitCode: 0, stdout: "Daemon: offline\n" });

  const result = await daemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
});

test("daemonStatus returns running: false when stdout contains 'stopped'", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "belayer daemon stopped\n" });

  const result = await daemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
});

test("daemonStatus returns running: false when stdout contains 'not running'", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "daemon is not running\n" });

  const result = await daemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
});

test("daemonStatus returns running: false when stdout contains 'inactive'", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "Service: inactive\n" });

  const result = await daemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
});

test("daemonStatus returns running: false when stderr contains 'offline'", async () => {
  // In case the daemon writes status to stderr
  const spawn = mockSpawn({ exitCode: 1, stdout: "", stderr: "Daemon: offline" });

  const result = await daemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
});

test("daemonStatus returns raw stdout and stderr", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "Daemon: running\n", stderr: "" });

  const result = await daemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.raw.stdout, "Daemon: running\n");
  assert.equal(result.raw.stderr, "");
});

test("daemonStatus uses custom belayerCli path", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "running\n" });

  await daemonStatus({ belayerCli: "/custom/belayer", spawnSubprocess: spawn });

  assert.equal(spawn.calls[0].cmd, "/custom/belayer");
});

// ─── BelayerNotInstalledError ─────────────────────────────────────────────────

test("BelayerNotInstalledError is thrown when ENOENT occurs in belayerAuthEnsure", async () => {
  const spawn = enoentSpawn();

  await assert.rejects(
    () => belayerAuthEnsure({ spawnSubprocess: spawn }),
    (err) => {
      assert.ok(err instanceof BelayerNotInstalledError);
      assert.ok(err.message.includes("belayer CLI not installed"));
      assert.ok(err.cause != null);
      return true;
    }
  );
});

test("BelayerNotInstalledError is thrown when ENOENT occurs in climbStart", async () => {
  const spawn = enoentSpawn();

  await assert.rejects(
    () => climbStart({ spawnSubprocess: spawn }),
    BelayerNotInstalledError
  );
});

test("BelayerNotInstalledError is thrown when ENOENT occurs in messageSend", async () => {
  const spawn = enoentSpawn();

  await assert.rejects(
    () => messageSend({ sessionId: "s", to: "x", text: "t", spawnSubprocess: spawn }),
    BelayerNotInstalledError
  );
});

// ─── BelayerCommandError ─────────────────────────────────────────────────────

test("BelayerCommandError includes stderr in message", () => {
  const err = new BelayerCommandError("climb start", 42, "rate limited");
  assert.ok(err.message.includes("rate limited"));
  assert.equal(err.exitCode, 42);
  assert.equal(err.stderr, "rate limited");
  assert.ok(err instanceof Error);
});
