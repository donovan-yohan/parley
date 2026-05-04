import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureSession,
  sendToAgent,
  registerAgent,
  getSession,
  _resetForTests,
  BelayerDaemonNotRunningError,
  SessionNotStartedError,
} from "../../src/runtime/belayer/sessionManager.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDaemonStatusFn(running = true) {
  return async () => ({ running, raw: { stdout: "", stderr: "" } });
}

function makeClimbStartFn(sessionId = "session-abc-123") {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    return { sessionId, raw: { stdout: "", stderr: "" } };
  };
  fn.calls = calls;
  return fn;
}

function makeMessageSendFn() {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    return { ok: true, raw: { stdout: "", stderr: "" } };
  };
  fn.calls = calls;
  return fn;
}

// Base opts used by most ensureSession tests
const baseEnsureOpts = {
  worldInstanceId: "world-1",
  storyId: "story-99",
  cragSlug: "world-1",
  supervisorTalent: "storyteller",
  workdir: "/tmp/parley",
  initialTask: "Begin the adventure.",
};

// ─── _resetForTests ───────────────────────────────────────────────────────────

test("_resetForTests clears all session state", async () => {
  const climbStartFn = makeClimbStartFn();
  const daemonStatusFn = makeDaemonStatusFn(true);

  await ensureSession({ ...baseEnsureOpts, climbStartFn, daemonStatusFn });
  assert.notEqual(getSession({ worldInstanceId: "world-1", storyId: "story-99" }), null);

  _resetForTests();

  assert.equal(getSession({ worldInstanceId: "world-1", storyId: "story-99" }), null);
});

// ─── ensureSession — happy path ───────────────────────────────────────────────

test("ensureSession happy path: returns session record with alreadyExisted: false", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-001");
  const daemonStatusFn = makeDaemonStatusFn(true);

  const result = await ensureSession({
    ...baseEnsureOpts,
    climbStartFn,
    daemonStatusFn,
  });

  assert.equal(result.sessionId, "sess-001");
  assert.equal(result.alreadyExisted, false);
  assert.equal(typeof result.supervisorProfile, "string");
  assert.ok(result.agents instanceof Set);
  assert.ok(result.agents.has("storyteller"));
  assert.equal(climbStartFn.calls.length, 1);
});

test("ensureSession passes correct name and task to climbStartFn", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-002");
  const daemonStatusFn = makeDaemonStatusFn(true);

  await ensureSession({
    ...baseEnsureOpts,
    worldInstanceId: "w2",
    storyId: "s2",
    cragSlug: "w2",
    initialTask: "Start quest.",
    workdir: "/var/parley",
    climbStartFn,
    daemonStatusFn,
  });

  assert.equal(climbStartFn.calls.length, 1);
  assert.equal(climbStartFn.calls[0].name, "parley-w2-s2");
  assert.equal(climbStartFn.calls[0].task, "Start quest.");
  assert.equal(climbStartFn.calls[0].workdir, "/var/parley");
});

test("ensureSession computes supervisorProfile as blyr-<cragSlug>-<supervisorTalent>", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-003");
  const daemonStatusFn = makeDaemonStatusFn(true);

  const result = await ensureSession({
    ...baseEnsureOpts,
    cragSlug: "mycrag",
    supervisorTalent: "narrator",
    climbStartFn,
    daemonStatusFn,
  });

  assert.equal(result.supervisorProfile, "blyr-mycrag-narrator");
  assert.equal(climbStartFn.calls[0].supervisorProfile, "blyr-mycrag-narrator");
});

// ─── ensureSession — idempotent ───────────────────────────────────────────────

test("ensureSession idempotent: second call returns same sessionId and alreadyExisted: true", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-idem");
  const daemonStatusFn = makeDaemonStatusFn(true);

  const first = await ensureSession({ ...baseEnsureOpts, climbStartFn, daemonStatusFn });
  const second = await ensureSession({ ...baseEnsureOpts, climbStartFn, daemonStatusFn });

  assert.equal(first.sessionId, second.sessionId);
  assert.equal(first.alreadyExisted, false);
  assert.equal(second.alreadyExisted, true);
  // climbStartFn called only once
  assert.equal(climbStartFn.calls.length, 1);
});

test("ensureSession idempotent: different (worldInstanceId, storyId) pairs get separate sessions", async () => {
  _resetForTests();
  const climbStartFn1 = makeClimbStartFn("sess-A");
  const climbStartFn2 = makeClimbStartFn("sess-B");
  const daemonStatusFn = makeDaemonStatusFn(true);

  const a = await ensureSession({
    ...baseEnsureOpts,
    worldInstanceId: "w-a",
    storyId: "s-a",
    cragSlug: "wa",
    climbStartFn: climbStartFn1,
    daemonStatusFn,
  });
  const b = await ensureSession({
    ...baseEnsureOpts,
    worldInstanceId: "w-b",
    storyId: "s-b",
    cragSlug: "wb",
    climbStartFn: climbStartFn2,
    daemonStatusFn,
  });

  assert.equal(a.sessionId, "sess-A");
  assert.equal(b.sessionId, "sess-B");
  assert.notEqual(a.sessionId, b.sessionId);
});

// ─── ensureSession — daemon down ──────────────────────────────────────────────

test("ensureSession daemon down: throws BelayerDaemonNotRunningError", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-never");
  const daemonStatusFn = makeDaemonStatusFn(false);

  await assert.rejects(
    () => ensureSession({ ...baseEnsureOpts, climbStartFn, daemonStatusFn }),
    BelayerDaemonNotRunningError
  );
  // climbStartFn must NOT have been called
  assert.equal(climbStartFn.calls.length, 0);
});

test("ensureSession daemon down: error message mentions belayer daemon command", async () => {
  _resetForTests();
  const daemonStatusFn = makeDaemonStatusFn(false);
  const climbStartFn = makeClimbStartFn();

  let caught;
  try {
    await ensureSession({ ...baseEnsureOpts, climbStartFn, daemonStatusFn });
  } catch (err) {
    caught = err;
  }

  assert.ok(caught instanceof BelayerDaemonNotRunningError);
  assert.ok(caught.message.includes("belayer daemon"));
});

// ─── ensureSession — profile name budget exceeded ─────────────────────────────

test("ensureSession profile-name budget exceeded: throws with budget error", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn();
  const daemonStatusFn = makeDaemonStatusFn(true);

  // cragSlug (25 chars) + supervisorTalent (34 chars) = 59 > 58 combined budget
  const longCrag = "a".repeat(25);
  const longTalent = "b".repeat(34);

  await assert.rejects(
    () =>
      ensureSession({
        ...baseEnsureOpts,
        cragSlug: longCrag,
        supervisorTalent: longTalent,
        climbStartFn,
        daemonStatusFn,
      }),
    /budget|exceed|shorten/i
  );

  assert.equal(climbStartFn.calls.length, 0);
});

// ─── sendToAgent — happy path ─────────────────────────────────────────────────

test("sendToAgent happy path: messageSendFn called with correct args", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-send");
  const daemonStatusFn = makeDaemonStatusFn(true);
  const messageSendFn = makeMessageSendFn();

  await ensureSession({
    ...baseEnsureOpts,
    supervisorTalent: "storyteller",
    climbStartFn,
    daemonStatusFn,
  });

  const result = await sendToAgent({
    worldInstanceId: baseEnsureOpts.worldInstanceId,
    storyId: baseEnsureOpts.storyId,
    to: "storyteller",
    text: "Hello, world!",
    interrupt: false,
    messageSendFn,
  });

  assert.equal(messageSendFn.calls.length, 1);
  assert.deepEqual(messageSendFn.calls[0], {
    sessionId: "sess-send",
    to: "storyteller",
    text: "Hello, world!",
    interrupt: false,
  });
  assert.equal(result.ok, true);
});

test("sendToAgent passes interrupt: true when specified", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-intr");
  const daemonStatusFn = makeDaemonStatusFn(true);
  const messageSendFn = makeMessageSendFn();

  await ensureSession({ ...baseEnsureOpts, climbStartFn, daemonStatusFn });

  await sendToAgent({
    worldInstanceId: baseEnsureOpts.worldInstanceId,
    storyId: baseEnsureOpts.storyId,
    to: "storyteller",
    text: "Urgent!",
    interrupt: true,
    messageSendFn,
  });

  assert.equal(messageSendFn.calls[0].interrupt, true);
});

// ─── sendToAgent — no session ─────────────────────────────────────────────────

test("sendToAgent no session: throws SessionNotStartedError", async () => {
  _resetForTests();
  const messageSendFn = makeMessageSendFn();

  await assert.rejects(
    () =>
      sendToAgent({
        worldInstanceId: "ghost-world",
        storyId: "ghost-story",
        to: "storyteller",
        text: "Hello?",
        messageSendFn,
      }),
    SessionNotStartedError
  );
  assert.equal(messageSendFn.calls.length, 0);
});

// ─── sendToAgent — agent not in roster ───────────────────────────────────────

test("sendToAgent agent not in roster: throws with helpful message naming agent + session", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-roster");
  const daemonStatusFn = makeDaemonStatusFn(true);
  const messageSendFn = makeMessageSendFn();

  await ensureSession({ ...baseEnsureOpts, climbStartFn, daemonStatusFn });

  let caught;
  try {
    await sendToAgent({
      worldInstanceId: baseEnsureOpts.worldInstanceId,
      storyId: baseEnsureOpts.storyId,
      to: "unknown-agent",
      text: "Hey!",
      messageSendFn,
    });
  } catch (err) {
    caught = err;
  }

  assert.ok(caught instanceof Error);
  assert.ok(caught.message.includes("unknown-agent"), "error should name the agent");
  assert.ok(caught.message.includes("sess-roster"), "error should name the session");
  assert.ok(caught.message.includes("roster") || caught.message.includes("spawn"));
  assert.equal(messageSendFn.calls.length, 0);
});

// ─── registerAgent ────────────────────────────────────────────────────────────

test("registerAgent adds to roster; subsequent sendToAgent to that agent works", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-reg");
  const daemonStatusFn = makeDaemonStatusFn(true);
  const messageSendFn = makeMessageSendFn();

  await ensureSession({ ...baseEnsureOpts, climbStartFn, daemonStatusFn });

  // Verify new agent not yet in roster
  await assert.rejects(
    () =>
      sendToAgent({
        worldInstanceId: baseEnsureOpts.worldInstanceId,
        storyId: baseEnsureOpts.storyId,
        to: "herald",
        text: "Test",
        messageSendFn,
      }),
    /herald/
  );

  // Register it
  registerAgent({
    worldInstanceId: baseEnsureOpts.worldInstanceId,
    storyId: baseEnsureOpts.storyId,
    agentName: "herald",
  });

  // Now send should succeed
  const result = await sendToAgent({
    worldInstanceId: baseEnsureOpts.worldInstanceId,
    storyId: baseEnsureOpts.storyId,
    to: "herald",
    text: "Hail!",
    messageSendFn,
  });

  assert.equal(result.ok, true);
  assert.equal(messageSendFn.calls.length, 1);
  assert.equal(messageSendFn.calls[0].to, "herald");
});

// ─── getSession ───────────────────────────────────────────────────────────────

test("getSession returns the session record when session exists", async () => {
  _resetForTests();
  const climbStartFn = makeClimbStartFn("sess-get");
  const daemonStatusFn = makeDaemonStatusFn(true);

  await ensureSession({ ...baseEnsureOpts, climbStartFn, daemonStatusFn });

  const session = getSession({
    worldInstanceId: baseEnsureOpts.worldInstanceId,
    storyId: baseEnsureOpts.storyId,
  });

  assert.ok(session !== null);
  assert.equal(session.sessionId, "sess-get");
  assert.ok(session.agents instanceof Set);
  assert.ok(session.climbStartedAt instanceof Date);
});

test("getSession returns null when no session exists", () => {
  _resetForTests();

  const session = getSession({ worldInstanceId: "no-world", storyId: "no-story" });

  assert.equal(session, null);
});
