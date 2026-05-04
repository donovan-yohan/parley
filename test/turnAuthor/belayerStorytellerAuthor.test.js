import assert from "node:assert/strict";
import test from "node:test";

import {
  createBelayerStorytellerAuthor,
  summarizeWorldState,
} from "../../src/runtime/turnAuthor/belayerStorytellerAuthor.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SCENARIO = {
  id: "scenario-opening",
  world: "last-lantern",
  suggestedPlayerIntents: ["Ask about the north road", "Order a drink", "Watch the room"],
};

const SCENE = {
  id: "scene-common-room",
  title: "Common Room",
  instance: "last-lantern-default",
};

const CHARACTERS = [
  { id: "mara", name: "Mara Underbough", role: "keeper", lifecycle: "persistent" },
  { id: "traveler", name: "The Hooded Traveler", role: "witness", lifecycle: "transient" },
];

const WORLD_STATE = {
  canon: [
    { text: "The lantern at the north gate has been dark for three nights." },
    { text: "Mara owes a debt to the Stoneman family." },
  ],
  rumors: [{ text: "Something moved on the road after the last bell." }],
  leads: [{ text: "The traveler's boots have mud from the north stones." }],
  unresolved: [{ text: "Who left the silver coin under the bar?" }],
};

/** A well-formed storyteller JSON response. */
function makeStoryellerPayload(overrides = {}) {
  return {
    narration:
      "Mara sets the cup down without looking at you. 'North road's closed,' she says, flat. 'Has been.'",
    next_choices: [
      "Press Mara for details",
      "Ask the hooded traveler instead",
      "Step outside to look at the gate",
    ],
    proposed_facts: [
      {
        id: "fact-north-road-closed",
        text: "The north road is officially closed.",
        category: "canon",
      },
    ],
    handled_rejected_claims: [],
    action_interpretation: null,
    detour_scene: null,
    story_consequence: null,
    beat_redirect: null,
    authoring: { author_id: "storyteller", mode: "live" },
    ...overrides,
  };
}

// ─── Mock factories ───────────────────────────────────────────────────────────

/**
 * sendFn that records its call and resolves immediately.
 */
function makeSendFn() {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    return { ok: true, raw: { stdout: "", stderr: "" } };
  };
  fn.calls = calls;
  return fn;
}

/**
 * followFn that immediately calls onEvent with the provided event, then resolves.
 */
function makeFollowFn(event) {
  return async ({ onEvent }) => {
    onEvent(event);
  };
}

/**
 * followFn that never calls onEvent before the AbortSignal fires (simulates timeout).
 * Resolves when the signal is aborted.
 */
function makeTimeoutFollowFn() {
  return async ({ signal }) => {
    await new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      signal?.addEventListener("abort", resolve, { once: true });
    });
  };
}

/**
 * followFn that throws synchronously (simulates stream-level error).
 */
function makeErrorFollowFn(error) {
  return async () => {
    throw error;
  };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

test("authorTurn happy path: sendFn called with correctly-shaped JSON envelope", async () => {
  const sendFn = makeSendFn();
  const payload = makeStoryellerPayload();
  const followFn = makeFollowFn({
    type: "agent:message",
    agent: "storyteller",
    role: "assistant",
    finish_reason: "stop",
    content: JSON.stringify(payload),
  });

  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-abc",
    storyId: "story-001",
    sendFn,
    followFn,
    responseTimeoutMs: 5000,
  });

  await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Ask Mara about the north road",
    characters: CHARACTERS,
    previousWorldState: WORLD_STATE,
    turnId: "turn-0001",
  });

  assert.equal(sendFn.calls.length, 1, "sendFn should be called exactly once");

  const call = sendFn.calls[0];
  assert.equal(call.sessionId, "session-abc", "sessionId should match worldInstanceId");
  assert.equal(call.to, "storyteller", "message sent to storyteller agent");

  const body = JSON.parse(call.text);
  assert.equal(body.type, "player_turn");
  assert.equal(body.turn_id, "turn-0001");
  assert.equal(body.player_action, "Ask Mara about the north road");
  assert.equal(body.scenario.id, "scenario-opening");
  assert.equal(body.scene.id, "scene-common-room");
  assert.equal(body.characters.length, 2);
  assert.equal(body.characters[0].id, "mara");
  assert.ok(body.previous_world_state_summary, "world state summary should be present");
  assert.ok(Array.isArray(body.previous_world_state_summary.canon));
});

test("authorTurn happy path: returns parsed narration + nextChoices from storyteller", async () => {
  const payload = makeStoryellerPayload();
  const followFn = makeFollowFn({
    type: "agent:message",
    agent: "storyteller",
    role: "assistant",
    finish_reason: "stop",
    content: JSON.stringify(payload),
  });

  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-abc",
    storyId: "story-001",
    sendFn: makeSendFn(),
    followFn,
    responseTimeoutMs: 5000,
  });

  const result = await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Ask Mara about the north road",
    characters: CHARACTERS,
    previousWorldState: null,
    turnId: "turn-0001",
  });

  assert.ok(result.narration.includes("Mara"), "narration should contain storyteller prose");
  assert.equal(result.nextChoices.length, 3);
  assert.equal(result.nextChoices[0], "Press Mara for details");
  assert.equal(result.proposedFacts.length, 1);
  assert.equal(result.proposedFacts[0].id, "fact-north-road-closed");
  assert.equal(result.proposedFacts[0].category, "canon");
  assert.deepEqual(result.handledRejectedClaims, []);
  assert.equal(result.actionInterpretation, null);
  assert.equal(result.detourScene, null);
  assert.equal(result.storyConsequence, null);
  assert.equal(result.beatRedirect, null);
  assert.equal(result.authoring.mode, "live");
});

test("authorTurn happy path: accepts agent:turn_complete event type", async () => {
  const payload = makeStoryellerPayload();
  const followFn = makeFollowFn({
    type: "agent:turn_complete",
    agent: "storyteller",
    output: JSON.stringify(payload),
  });

  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-xyz",
    storyId: "story-002",
    sendFn: makeSendFn(),
    followFn,
    responseTimeoutMs: 5000,
  });

  const result = await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Watch the room",
    characters: [],
    previousWorldState: null,
    turnId: "turn-0002",
  });

  assert.ok(result.narration.length > 0);
  assert.equal(result.authoring.mode, "live");
});

test("authorTurn: events from other agents are ignored; only storyteller response accepted", async () => {
  const payload = makeStoryellerPayload();
  let onEventRef;

  // followFn that captures onEvent and lets us fire events manually
  const followFn = async ({ signal, onEvent }) => {
    onEventRef = onEvent;
    // Fire a red-herring event from another agent
    onEvent({ type: "agent:message", agent: "supervisor", role: "assistant", finish_reason: "stop", content: '{"narration":"wrong"}' });
    // Fire the correct event
    onEvent({
      type: "agent:message",
      agent: "storyteller",
      role: "assistant",
      finish_reason: "stop",
      content: JSON.stringify(payload),
    });
    // Wait for abort (which fires after we resolve)
    await new Promise((resolve) => signal?.addEventListener("abort", resolve, { once: true }) ?? resolve());
  };

  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-abc",
    storyId: "story-001",
    sendFn: makeSendFn(),
    followFn,
    responseTimeoutMs: 5000,
  });

  const result = await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Watch the room",
    characters: [],
    previousWorldState: null,
    turnId: "turn-0003",
  });

  assert.ok(result.narration.includes("Mara"), "should use storyteller narration, not supervisor's");
});

// ─── Error: unparseable output ─────────────────────────────────────────────────

test("authorTurn: storyteller unparseable output returns mode:error without throwing", async () => {
  const followFn = makeFollowFn({
    type: "agent:message",
    agent: "storyteller",
    role: "assistant",
    finish_reason: "stop",
    content: "this is not json at all }{",
  });

  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-abc",
    storyId: "story-001",
    sendFn: makeSendFn(),
    followFn,
    responseTimeoutMs: 5000,
  });

  const result = await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Try something",
    characters: [],
    previousWorldState: null,
    turnId: "turn-err",
  });

  assert.equal(result.authoring.mode, "error", "mode should be 'error' on parse failure");
  assert.ok(result.narration.length > 0, "narration should contain the error message");
  assert.ok(
    result.narration.toLowerCase().includes("unparseable") ||
    result.narration.toLowerCase().includes("parse"),
    "error message should mention parse failure"
  );
  assert.deepEqual(result.proposedFacts, []);
  assert.deepEqual(result.handledRejectedClaims, []);
});

test("authorTurn: stream-level error returns mode:error without throwing", async () => {
  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-abc",
    storyId: "story-001",
    sendFn: makeSendFn(),
    followFn: makeErrorFollowFn(new Error("ENOENT: belayer not found")),
    responseTimeoutMs: 5000,
  });

  const result = await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Try something",
    characters: [],
    previousWorldState: null,
    turnId: "turn-stream-err",
  });

  assert.equal(result.authoring.mode, "error");
  assert.ok(result.narration.includes("ENOENT") || result.narration.includes("stream error"));
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

test("authorTurn: timeout returns mode:timeout result without throwing", async () => {
  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-abc",
    storyId: "story-001",
    sendFn: makeSendFn(),
    followFn: makeTimeoutFollowFn(),
    responseTimeoutMs: 50, // very short for the test
  });

  const result = await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Wait forever",
    characters: [],
    previousWorldState: null,
    turnId: "turn-timeout",
  });

  assert.equal(result.authoring.mode, "timeout", "mode should be 'timeout'");
  assert.ok(result.narration.length > 0, "narration should contain the timeout message");
  assert.ok(
    result.narration.includes("50ms") || result.narration.includes("did not respond"),
    "timeout message should mention timeout"
  );
  assert.deepEqual(result.proposedFacts, []);
});

// ─── summarizeWorldState ──────────────────────────────────────────────────────

test("summarizeWorldState: returns null for null input", () => {
  assert.equal(summarizeWorldState(null), null);
});

test("summarizeWorldState: returns null for undefined input", () => {
  assert.equal(summarizeWorldState(undefined), null);
});

test("summarizeWorldState: maps text fields from world state categories", () => {
  const result = summarizeWorldState(WORLD_STATE);

  assert.ok(Array.isArray(result.canon));
  assert.equal(result.canon.length, 2);
  assert.equal(result.canon[0], "The lantern at the north gate has been dark for three nights.");
  assert.equal(result.rumors.length, 1);
  assert.equal(result.leads.length, 1);
  assert.equal(result.unresolved.length, 1);
});

test("summarizeWorldState: truncates long arrays (canon max 5, unresolved max 3)", () => {
  const bigState = {
    canon: Array.from({ length: 10 }, (_, i) => ({ text: `canon-${i}` })),
    rumors: Array.from({ length: 10 }, (_, i) => ({ text: `rumor-${i}` })),
    leads: Array.from({ length: 10 }, (_, i) => ({ text: `lead-${i}` })),
    unresolved: Array.from({ length: 10 }, (_, i) => ({ text: `unresolved-${i}` })),
  };

  const result = summarizeWorldState(bigState);

  assert.equal(result.canon.length, 5, "canon truncated to 5");
  assert.equal(result.rumors.length, 5, "rumors truncated to 5");
  assert.equal(result.leads.length, 5, "leads truncated to 5");
  assert.equal(result.unresolved.length, 3, "unresolved truncated to 3");
  // Slice(-5) returns the LAST 5, so canon-5..canon-9
  assert.equal(result.canon[0], "canon-5");
  assert.equal(result.unresolved[0], "unresolved-7");
});

test("summarizeWorldState: handles missing categories gracefully", () => {
  const result = summarizeWorldState({ canon: [{ text: "only canon" }] });

  assert.deepEqual(result.canon, ["only canon"]);
  assert.deepEqual(result.rumors, []);
  assert.deepEqual(result.leads, []);
  assert.deepEqual(result.unresolved, []);
});

test("summarizeWorldState: handles empty world state object", () => {
  const result = summarizeWorldState({});

  assert.deepEqual(result.canon, []);
  assert.deepEqual(result.rumors, []);
  assert.deepEqual(result.leads, []);
  assert.deepEqual(result.unresolved, []);
});

// ─── Message envelope shape ────────────────────────────────────────────────────

test("authorTurn: envelope includes all expected fields including characters + world state", async () => {
  const sendFn = makeSendFn();
  const payload = makeStoryellerPayload();

  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-envelope",
    storyId: "story-envelope",
    sendFn,
    followFn: makeFollowFn({
      type: "agent:message",
      agent: "storyteller",
      role: "assistant",
      finish_reason: "stop",
      content: JSON.stringify(payload),
    }),
    responseTimeoutMs: 5000,
  });

  await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Check the corner table",
    characters: CHARACTERS,
    previousWorldState: WORLD_STATE,
    turnId: "turn-envelope",
  });

  const body = JSON.parse(sendFn.calls[0].text);

  // Verify character mapping (only id/name/role/lifecycle)
  assert.deepEqual(body.characters, [
    { id: "mara", name: "Mara Underbough", role: "keeper", lifecycle: "persistent" },
    { id: "traveler", name: "The Hooded Traveler", role: "witness", lifecycle: "transient" },
  ]);

  // Verify world state summary present + correct shape
  const summary = body.previous_world_state_summary;
  assert.ok(Array.isArray(summary.canon));
  assert.ok(Array.isArray(summary.rumors));
  assert.ok(Array.isArray(summary.leads));
  assert.ok(Array.isArray(summary.unresolved));
  assert.equal(summary.canon[0], "The lantern at the north gate has been dark for three nights.");
});

test("authorTurn: envelope omits world state summary when previousWorldState is null", async () => {
  const sendFn = makeSendFn();
  const payload = makeStoryellerPayload();

  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-nostate",
    storyId: "story-nostate",
    sendFn,
    followFn: makeFollowFn({
      type: "agent:message",
      agent: "storyteller",
      role: "assistant",
      finish_reason: "stop",
      content: JSON.stringify(payload),
    }),
    responseTimeoutMs: 5000,
  });

  await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Ask something",
    characters: [],
    previousWorldState: null,
    turnId: "turn-nostate",
  });

  const body = JSON.parse(sendFn.calls[0].text);
  assert.equal(body.previous_world_state_summary, null);
});

// ─── Custom agent name ─────────────────────────────────────────────────────────

test("authorTurn: custom storytellerAgentName is used in sendFn and followFn filter", async () => {
  const sendFn = makeSendFn();
  const payload = makeStoryellerPayload();

  const author = createBelayerStorytellerAuthor({
    worldInstanceId: "session-custom",
    storyId: "story-custom",
    sendFn,
    followFn: makeFollowFn({
      type: "agent:message",
      agent: "gm-custom",
      role: "assistant",
      finish_reason: "stop",
      content: JSON.stringify(payload),
    }),
    storytellerAgentName: "gm-custom",
    responseTimeoutMs: 5000,
  });

  const result = await author.authorTurn({
    scenario: SCENARIO,
    scene: SCENE,
    playerAction: "Look around",
    characters: [],
    previousWorldState: null,
    turnId: "turn-custom",
  });

  assert.equal(sendFn.calls[0].to, "gm-custom");
  assert.ok(result.narration.length > 0);
});
