import assert from "node:assert/strict";
import test from "node:test";

import {
  belayerAuthEnsure,
  belayerCragExists,
  belayerMailSend,
  belayerDaemonStatus,
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

// ─── belayerMailSend ─────────────────────────────────────────────────────────

test("belayerMailSend happy path: spawn called with correct args and body piped to stdin", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: JSON.stringify({ messageId: "msg-001" }) });

  const result = await belayerMailSend({
    cragSlug: "my-crag",
    talentName: "alice",
    body: "Hello Alice!",
    clientEventId: "evt-123",
    spawnSubprocess: spawn,
  });

  assert.equal(spawn.calls.length, 1);
  const call = spawn.calls[0];
  assert.equal(call.cmd, "belayer");
  assert.deepEqual(call.args, [
    "mail", "send",
    "--crag", "my-crag",
    "--to", "alice",
    "--client-event-id", "evt-123",
  ]);
  assert.equal(call.opts.stdin, "Hello Alice!");
  assert.equal(result.ok, true);
  assert.equal(result.messageId, "msg-001");
});

test("belayerMailSend extracts messageId from message_id field", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: JSON.stringify({ message_id: "msg-xyz" }) });

  const result = await belayerMailSend({
    cragSlug: "c",
    talentName: "bob",
    body: "hi",
    clientEventId: "evt-1",
    spawnSubprocess: spawn,
  });

  assert.equal(result.messageId, "msg-xyz");
});

test("belayerMailSend returns messageId null when stdout is not JSON", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "mail sent\n" });

  const result = await belayerMailSend({
    cragSlug: "c",
    talentName: "bob",
    body: "hi",
    clientEventId: "evt-1",
    spawnSubprocess: spawn,
  });

  assert.equal(result.ok, true);
  assert.equal(result.messageId, null);
});

test("belayerMailSend throws BelayerCommandError on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 2, stderr: "quota exceeded" });

  await assert.rejects(
    () =>
      belayerMailSend({
        cragSlug: "c",
        talentName: "bob",
        body: "hi",
        clientEventId: "e1",
        spawnSubprocess: spawn,
      }),
    (err) => {
      assert.ok(err instanceof BelayerCommandError);
      assert.equal(err.exitCode, 2);
      assert.ok(err.stderr.includes("quota exceeded"));
      return true;
    }
  );
});

// ─── belayerDaemonStatus ─────────────────────────────────────────────────────

test("belayerDaemonStatus returns running: true when exit 0 and no negative keywords", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "belayer daemon is running (pid 1234)\n" });

  const result = await belayerDaemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, true);
  assert.deepEqual(spawn.calls[0].args, ["status"]);
});

test("belayerDaemonStatus returns running: false on non-zero exit", async () => {
  const spawn = mockSpawn({ exitCode: 1, stdout: "", stderr: "daemon not started" });

  const result = await belayerDaemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
});

test("belayerDaemonStatus returns running: false when stdout says 'stopped'", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "belayer daemon stopped\n" });

  const result = await belayerDaemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
});

test("belayerDaemonStatus returns running: false when stdout says 'not running'", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "daemon is not running\n" });

  const result = await belayerDaemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
});

test("belayerDaemonStatus returns running: false when stdout says 'inactive'", async () => {
  const spawn = mockSpawn({ exitCode: 0, stdout: "Service: inactive\n" });

  const result = await belayerDaemonStatus({ spawnSubprocess: spawn });

  assert.equal(result.running, false);
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

test("BelayerNotInstalledError is thrown when ENOENT occurs in belayerMailSend", async () => {
  const spawn = enoentSpawn();

  await assert.rejects(
    () =>
      belayerMailSend({
        cragSlug: "c",
        talentName: "t",
        body: "b",
        clientEventId: "e",
        spawnSubprocess: spawn,
      }),
    BelayerNotInstalledError
  );
});

// ─── BelayerCommandError ─────────────────────────────────────────────────────

test("BelayerCommandError includes stderr in message", () => {
  const err = new BelayerCommandError("mail send", 42, "rate limited");
  assert.ok(err.message.includes("rate limited"));
  assert.equal(err.exitCode, 42);
  assert.equal(err.stderr, "rate limited");
  assert.ok(err instanceof Error);
});
