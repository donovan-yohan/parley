/**
 * Tests for belayerTruthJudge.js
 *
 * All Belayer side-effects (sendFn, followFn) are injected mocks.
 * No real CLI calls are made.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createBelayerTruthJudge } from "../../src/runtime/truthAuthority/belayerTruthJudge.js";

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const TURN_ID = "turn-0001";

const MINIMAL_CONTEXT = {
  turnId: TURN_ID,
  scene: { id: "tavern", title: "Last Lantern Tavern" },
  scenario: { id: "last-lantern" },
  playerAction: "I look around the room.",
  narration: "The tavern is dimly lit.",
  characters: [{ id: "mirela", name: "Mirela", knowledgeBoundary: "npc" }],
  proposedFacts: [{ id: "fact-1", text: "The tavern has a hidden cellar.", category: "rumor" }],
  handledRejectedClaims: [],
  actionInterpretation: null,
  detourScene: null,
  storyConsequence: null,
  beatRedirect: null,
  stateDir: "/tmp/state",
  worldDir: "/tmp/world",
};

const VALID_VERDICT = {
  id: `${TURN_ID}-truth`,
  schema_version: "parley-truth-verdict/v1",
  turn_id: TURN_ID,
  verdict: "pass",
  accepted_facts: [{ id: "fact-1", text: "Some canon fact.", category: "canon" }],
  rumors: [{ id: "r-1", text: "A rumor.", category: "rumor" }],
  leads: [],
  character_beliefs: [],
  unresolved: [],
  rejected_claims: [],
  author_only_hidden_truth: [],
};

// ─── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Creates a mock sendFn that records calls and resolves with a sessionId.
 */
function makeSendFn({ sessionId = "session-abc", shouldThrow = false } = {}) {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    if (shouldThrow) throw new Error("send failed");
    return { sessionId };
  };
  fn.calls = calls;
  return fn;
}

/**
 * Creates a mock followFn that immediately calls onEvent with `verdict`
 * then resolves (simulating the log stream emitting a verdict and closing).
 *
 * @param {object|null} verdict  - The event payload to emit. null = no event emitted.
 * @param {object} opts
 * @param {boolean} opts.wrapInPayload  - If true, wraps verdict in { payload: verdict }
 * @param {boolean} opts.wrapInText     - If true, wraps verdict in { text: JSON.stringify(verdict) }
 */
function makeFollowFn(verdict, { wrapInPayload = false, wrapInText = false } = {}) {
  const calls = [];
  const fn = async ({ sessionId, agent, onEvent, signal }) => {
    calls.push({ sessionId, agent });
    if (verdict !== null) {
      const event = wrapInPayload
        ? { payload: verdict }
        : wrapInText
          ? { text: JSON.stringify(verdict) }
          : verdict;
      // Emit asynchronously to be realistic
      await Promise.resolve();
      if (!signal?.aborted) {
        onEvent(event);
      }
    }
    // Stream closes naturally after one event
  };
  fn.calls = calls;
  return fn;
}

/**
 * Creates a followFn that never emits any matching event (simulates timeout).
 * The real timeout is bypassed by using a very short responseTimeoutMs in tests.
 */
function makeTimeoutFollowFn() {
  const fn = async ({ signal }) => {
    // Hang until aborted
    await new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      signal?.addEventListener("abort", resolve, { once: true });
    });
  };
  return fn;
}

/**
 * Creates a followFn that emits garbage (non-JSON) lines and then closes.
 */
function makeGarbageFollowFn() {
  const fn = async ({ onEvent }) => {
    await Promise.resolve();
    onEvent({ type: "log", message: "not a verdict at all" });
    onEvent({ type: "heartbeat" });
  };
  return fn;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test("happy path: sendFn called with correctly-shaped JSON envelope", async () => {
  const sendFn = makeSendFn({ sessionId: "sess-1" });
  const followFn = makeFollowFn(VALID_VERDICT);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  await judge(MINIMAL_CONTEXT);

  assert.equal(sendFn.calls.length, 1, "sendFn called once");

  const call = sendFn.calls[0];
  assert.equal(call.worldInstanceId, "world-1");
  assert.equal(call.storyId, "story-1");
  assert.equal(call.to, "truth-judge");

  // The text must be valid JSON
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(call.text); }, "message text is valid JSON");

  assert.equal(parsed.type, "judge_turn");
  assert.equal(parsed.turn_id, TURN_ID);
  assert.equal(parsed.scenario_id, "last-lantern");
  assert.deepEqual(parsed.scene, { id: "tavern", title: "Last Lantern Tavern" });
  assert.equal(parsed.player_action, MINIMAL_CONTEXT.playerAction);
  assert.equal(parsed.narration, MINIMAL_CONTEXT.narration);
  assert.deepEqual(parsed.proposed_facts, MINIMAL_CONTEXT.proposedFacts);
  assert.deepEqual(parsed.handled_rejected_claims, []);
  assert.deepEqual(parsed.characters, [{ id: "mirela", name: "Mirela", knowledgeBoundary: "npc" }]);
});

test("happy path: followFn returns structured verdict; judgeTurn returns it normalized", async () => {
  const sendFn = makeSendFn({ sessionId: "sess-2" });
  const followFn = makeFollowFn(VALID_VERDICT);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  const verdict = await judge(MINIMAL_CONTEXT);

  assert.equal(verdict.schema_version, "parley-truth-verdict/v1");
  assert.equal(verdict.turn_id, TURN_ID);
  assert.equal(verdict.verdict, "pass");
  assert.ok(Array.isArray(verdict.accepted_facts));
  assert.ok(Array.isArray(verdict.rumors));
  assert.ok(Array.isArray(verdict.leads));
  assert.ok(Array.isArray(verdict.character_beliefs));
  assert.ok(Array.isArray(verdict.unresolved));
  assert.ok(Array.isArray(verdict.rejected_claims));
  assert.ok(Array.isArray(verdict.author_only_hidden_truth));
  assert.ok(typeof verdict.id === "string" && verdict.id.length > 0, "verdict.id is non-empty string");
});

test("happy path: verdict received wrapped in event.payload", async () => {
  const sendFn = makeSendFn({ sessionId: "sess-3" });
  const followFn = makeFollowFn(VALID_VERDICT, { wrapInPayload: true });

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  const verdict = await judge(MINIMAL_CONTEXT);

  assert.equal(verdict.verdict, "pass");
  assert.equal(verdict.schema_version, "parley-truth-verdict/v1");
});

test("happy path: verdict received as JSON string in event.text", async () => {
  const sendFn = makeSendFn({ sessionId: "sess-4" });
  const followFn = makeFollowFn(VALID_VERDICT, { wrapInText: true });

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  const verdict = await judge(MINIMAL_CONTEXT);

  assert.equal(verdict.verdict, "pass");
  assert.equal(verdict.turn_id, TURN_ID);
});

test("verdict missing required arrays: normalizeVerdict fills them with []", async () => {
  // A partial verdict — missing most arrays
  const partialVerdict = {
    id: `${TURN_ID}-truth`,
    schema_version: "parley-truth-verdict/v1",
    turn_id: TURN_ID,
    verdict: "pass",
    accepted_facts: [{ id: "f-1", text: "A fact.", category: "canon" }],
    // rumors, leads, character_beliefs, unresolved, rejected_claims, author_only_hidden_truth all missing
  };

  const sendFn = makeSendFn({ sessionId: "sess-5" });
  const followFn = makeFollowFn(partialVerdict);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  const verdict = await judge(MINIMAL_CONTEXT);

  assert.deepEqual(verdict.rumors, [], "missing rumors defaults to []");
  assert.deepEqual(verdict.leads, [], "missing leads defaults to []");
  assert.deepEqual(verdict.character_beliefs, [], "missing character_beliefs defaults to []");
  assert.deepEqual(verdict.unresolved, [], "missing unresolved defaults to []");
  assert.deepEqual(verdict.rejected_claims, [], "missing rejected_claims defaults to []");
  assert.deepEqual(verdict.author_only_hidden_truth, [], "missing author_only_hidden_truth defaults to []");
  assert.deepEqual(verdict.accepted_facts, partialVerdict.accepted_facts, "present accepted_facts preserved");
});

test("verdict.verdict missing: defaults to 'pass'", async () => {
  const noVerdictField = {
    id: `${TURN_ID}-truth`,
    schema_version: "parley-truth-verdict/v1",
    turn_id: TURN_ID,
    // verdict field absent
    accepted_facts: [],
    rumors: [],
    leads: [],
    character_beliefs: [],
    unresolved: [],
    rejected_claims: [],
    author_only_hidden_truth: [],
  };

  // _looksLikeVerdict matches on schema_version so no verdict field is fine
  const sendFn = makeSendFn({ sessionId: "sess-6" });
  const followFn = makeFollowFn(noVerdictField);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  const verdict = await judge(MINIMAL_CONTEXT);

  assert.equal(verdict.verdict, "pass", "missing verdict field defaults to 'pass'");
});

test("judge emits unparseable/non-verdict output: returns safe-default verdict without throwing", async () => {
  const sendFn = makeSendFn({ sessionId: "sess-7" });
  const followFn = makeGarbageFollowFn();

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  let verdict;
  await assert.doesNotReject(async () => {
    verdict = await judge(MINIMAL_CONTEXT);
  }, "judgeTurn must not throw on unparseable output");

  assert.equal(verdict.verdict, "pass", "safe default is pass");
  assert.equal(verdict.turn_id, TURN_ID);
  assert.deepEqual(verdict.accepted_facts, []);
  assert.deepEqual(verdict.rumors, []);
  assert.deepEqual(verdict.leads, []);
  assert.deepEqual(verdict.character_beliefs, []);
  assert.deepEqual(verdict.unresolved, []);
  assert.deepEqual(verdict.rejected_claims, []);
  assert.deepEqual(verdict.author_only_hidden_truth, []);
  assert.ok(typeof verdict.id === "string" && verdict.id.length > 0, "safe default has non-empty id");
});

test("timeout: judgeTurn returns safe-default verdict without throwing", async () => {
  const sendFn = makeSendFn({ sessionId: "sess-8" });
  const followFn = makeTimeoutFollowFn();

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 50, // very short to keep tests fast
  });

  let verdict;
  await assert.doesNotReject(async () => {
    verdict = await judge(MINIMAL_CONTEXT);
  }, "judgeTurn must not throw on timeout");

  assert.equal(verdict.verdict, "pass", "timeout safe default is pass");
  assert.equal(verdict.turn_id, TURN_ID);
  assert.ok(typeof verdict.id === "string" && verdict.id.length > 0);
  assert.deepEqual(verdict.accepted_facts, []);
  assert.deepEqual(verdict.rumors, []);
  assert.deepEqual(verdict.leads, []);
  assert.deepEqual(verdict.character_beliefs, []);
  assert.deepEqual(verdict.unresolved, []);
  assert.deepEqual(verdict.rejected_claims, []);
  assert.deepEqual(verdict.author_only_hidden_truth, []);
});

test("sendFn throws: judgeTurn returns safe-default without throwing", async () => {
  const sendFn = makeSendFn({ shouldThrow: true });
  const followFn = makeFollowFn(VALID_VERDICT);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  let verdict;
  await assert.doesNotReject(async () => {
    verdict = await judge(MINIMAL_CONTEXT);
  }, "judgeTurn must not throw when sendFn throws");

  assert.equal(verdict.verdict, "pass");
  assert.equal(verdict.turn_id, TURN_ID);
});

test("followFn is called with the sessionId returned by sendFn", async () => {
  const expectedSessionId = "session-xyz-789";
  const sendFn = makeSendFn({ sessionId: expectedSessionId });
  const followFn = makeFollowFn(VALID_VERDICT);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  await judge(MINIMAL_CONTEXT);

  assert.equal(followFn.calls.length, 1, "followFn called once");
  assert.equal(followFn.calls[0].sessionId, expectedSessionId, "followFn receives sessionId from sendFn");
  assert.equal(followFn.calls[0].agent, "truth-judge", "followFn filters by agent name");
});

test("truthJudgeAgentName is configurable", async () => {
  const sendFn = makeSendFn({ sessionId: "sess-custom" });
  const followFn = makeFollowFn(VALID_VERDICT);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
    truthJudgeAgentName: "custom-truth-agent",
  });

  await judge(MINIMAL_CONTEXT);

  assert.equal(sendFn.calls[0].to, "custom-truth-agent");
  assert.equal(followFn.calls[0].agent, "custom-truth-agent");
});

test("fail verdict is preserved (not coerced to pass)", async () => {
  const failVerdict = {
    ...VALID_VERDICT,
    verdict: "fail",
    rejected_claims: [{ id: "rc-1", claim: "Bad claim", reason: "Breaks canon", handled: true }],
  };

  const sendFn = makeSendFn({ sessionId: "sess-fail" });
  const followFn = makeFollowFn(failVerdict);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  const verdict = await judge(MINIMAL_CONTEXT);

  assert.equal(verdict.verdict, "fail", "fail verdict is preserved as-is");
  assert.equal(verdict.rejected_claims.length, 1);
});

test("revise verdict is preserved (not coerced to pass)", async () => {
  const reviseVerdict = {
    ...VALID_VERDICT,
    verdict: "revise",
    rejected_claims: [{ id: "rc-2", claim: "Problematic claim", reason: "Needs rework", handled: true }],
  };

  const sendFn = makeSendFn({ sessionId: "sess-revise" });
  const followFn = makeFollowFn(reviseVerdict);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  const verdict = await judge(MINIMAL_CONTEXT);

  assert.equal(verdict.verdict, "revise", "revise verdict is preserved as-is");
});

test("optional DM artifact fields are included in the message envelope when provided", async () => {
  const sendFn = makeSendFn({ sessionId: "sess-artifacts" });
  const followFn = makeFollowFn(VALID_VERDICT);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  const contextWithArtifacts = {
    ...MINIMAL_CONTEXT,
    actionInterpretation: { id: "ai-1", type: "canonical" },
    detourScene: { id: "ds-1" },
    storyConsequence: { id: "sc-1" },
    beatRedirect: { id: "br-1" },
  };

  await judge(contextWithArtifacts);

  const parsed = JSON.parse(sendFn.calls[0].text);
  assert.deepEqual(parsed.action_interpretation, { id: "ai-1", type: "canonical" });
  assert.deepEqual(parsed.detour_scene, { id: "ds-1" });
  assert.deepEqual(parsed.story_consequence, { id: "sc-1" });
  assert.deepEqual(parsed.beat_redirect, { id: "br-1" });
});

test("null optional fields are serialized as null (not omitted) in envelope", async () => {
  const sendFn = makeSendFn({ sessionId: "sess-nulls" });
  const followFn = makeFollowFn(VALID_VERDICT);

  const judge = createBelayerTruthJudge({
    worldInstanceId: "world-1",
    storyId: "story-1",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  await judge(MINIMAL_CONTEXT);

  const parsed = JSON.parse(sendFn.calls[0].text);
  assert.equal(parsed.action_interpretation, null);
  assert.equal(parsed.detour_scene, null);
  assert.equal(parsed.story_consequence, null);
  assert.equal(parsed.beat_redirect, null);
});
