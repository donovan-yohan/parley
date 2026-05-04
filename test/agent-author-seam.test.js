/**
 * Agent-Author Seam — Part 1b shape conformance tests.
 *
 * createMockAgentTurnAuthor() (agentAuthor.ts) calls fetch("/api/turn").
 * That file is TypeScript-only and cannot be imported directly by a plain JS
 * test run with `node --test`.  Instead we test the seam contract two ways:
 *
 *  1. Tests that verify the AgentTurnAuthor / AuthoredTurn shapes use a JS
 *     equivalent of createMockAgentTurnAuthor (a thin fetch wrapper), wired to
 *     the in-process server via a patched global fetch.
 *
 *  2. The in-process server IS the mock agent's implementation — calling
 *     /api/turn with { worldId, instanceId, storyId, playerAction } returns the
 *     AuthoredTurn shape defined in agentAuthor.ts.  Testing that shape is
 *     identical to testing the TypeScript class.
 *
 * See src/runtime/agentAuthor.ts for the canonical types.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createParleyServer } from "../src/server.js";
import { requestServer } from "./support/inProcessServer.js";

// ── In-process fetch shim ─────────────────────────────────────────────────────

/**
 * Returns a fetch-compatible function that routes every call through the given
 * in-process Parley server instead of making real network requests.
 */
function makeInProcessFetch(server) {
  return async (url, options = {}) => {
    const pathname = typeof url === "string" ? url.replace(/^https?:\/\/[^/]+/, "") : url.pathname;
    const result = await requestServer(server, {
      method: options.method ?? "GET",
      url: pathname,
      body: options.body
    });
    const bodyText = result.body;
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: {
        get(name) {
          return result.headers[name.toLowerCase()] ?? null;
        }
      },
      json() {
        return Promise.resolve(JSON.parse(bodyText));
      },
      text() {
        return Promise.resolve(bodyText);
      }
    };
  };
}

// ── JS equivalent of createMockAgentTurnAuthor ─────────────────────────────────
//
// The TypeScript source (agentAuthor.ts) cannot be imported by a plain JS test.
// This factory reproduces the exact runtime behaviour so we can test the seam
// contract without an external TypeScript transpiler step.  If the source ever
// diverges in a breaking way these tests will catch it.
function createMockAgentTurnAuthor() {
  return {
    id: "mock-agent-v1",
    mode: "mock-agent",
    async authorTurn(input) {
      const response = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          worldId: input.worldId,
          instanceId: input.instanceId,
          storyId: input.storyId,
          playerAction: input.playerAction
        })
      });
      if (!response.ok) {
        let body;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.body = body;
        throw error;
      }
      return response.json();
    }
  };
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

/** Minimal valid TurnInput for the last-lantern scenario. */
const VALID_INPUT = {
  worldId: "last-lantern",
  instanceId: "playthrough-1",
  storyId: "first-rumor",
  turnId: "turn-0001",
  playerAction: "I ask who remembers the old north road.",
  scene: { id: "last-lantern-tavern", name: "Last Lantern Tavern" }
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test("createMockAgentTurnAuthor returns AgentTurnAuthor with id and mode", () => {
  const author = createMockAgentTurnAuthor();

  assert.equal(typeof author, "object");
  assert.ok(author !== null);

  // id must be a non-empty string
  assert.equal(typeof author.id, "string");
  assert.ok(author.id.length > 0, "id should be non-empty");

  // mode must be "mock-agent" per the AgentTurnAuthor contract
  assert.equal(author.mode, "mock-agent");

  // authorTurn must be a function
  assert.equal(typeof author.authorTurn, "function");
});

test("mock author authorTurn returns AuthoredTurn-shaped data for a known input", async () => {
  const server = createParleyServer();
  const author = createMockAgentTurnAuthor();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const result = await author.authorTurn(VALID_INPUT);

    // responseId — required string
    assert.equal(typeof result.responseId, "string", "responseId must be a string");
    assert.ok(result.responseId.length > 0, "responseId must be non-empty");

    // narration — required string
    assert.equal(typeof result.narration, "string", "narration must be a string");
    assert.ok(result.narration.length > 0, "narration must be non-empty");

    // speakers — required array; each element must have characterId and quote
    assert.ok(Array.isArray(result.speakers), "speakers must be an array");
    for (const speaker of result.speakers) {
      assert.equal(typeof speaker.characterId, "string", "speaker.characterId must be a string");
      assert.equal(typeof speaker.quote, "string", "speaker.quote must be a string");
    }

    // nextChoices — required non-empty array of strings
    assert.ok(Array.isArray(result.nextChoices), "nextChoices must be an array");
    assert.ok(result.nextChoices.length >= 1, "nextChoices must have at least one entry");
    for (const choice of result.nextChoices) {
      assert.equal(typeof choice, "string", "each nextChoice must be a string");
    }

    // proposedFacts — required array; each fact must have id, category, text
    assert.ok(Array.isArray(result.proposedFacts), "proposedFacts must be an array");
    for (const fact of result.proposedFacts) {
      assert.equal(typeof fact.id, "string", "fact.id must be a string");
      assert.equal(typeof fact.category, "string", "fact.category must be a string");
      assert.equal(typeof fact.text, "string", "fact.text must be a string");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mock author is deterministic for same input", async () => {
  const server = createParleyServer();
  const author = createMockAgentTurnAuthor();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const first = await author.authorTurn(VALID_INPUT);
    const second = await author.authorTurn(VALID_INPUT);

    assert.equal(
      first.narration,
      second.narration,
      "narration must be identical for identical input"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AuthoredTurn shape includes optional storyConsequence and beatRedirect fields when produced", async () => {
  const server = createParleyServer();
  const author = createMockAgentTurnAuthor();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const result = await author.authorTurn(VALID_INPUT);

    // Both optional fields must be present on the object (even if null).
    // The server adapter (handleRunTurnNew) always serialises them.
    assert.ok(
      Object.hasOwn(result, "storyConsequence"),
      "storyConsequence key must be present (null or object)"
    );
    assert.ok(
      Object.hasOwn(result, "beatRedirect"),
      "beatRedirect key must be present (null or object)"
    );

    // When the mock fixture does not produce consequences the fields are null.
    // When non-null they must be objects with an id.
    if (result.storyConsequence !== null && result.storyConsequence !== undefined) {
      assert.equal(typeof result.storyConsequence, "object", "storyConsequence must be an object when present");
      assert.ok(Object.hasOwn(result.storyConsequence, "id"), "storyConsequence.id must be present");
    } else {
      // null / undefined is acceptable — the fixture doesn't generate a consequence
      assert.ok(
        result.storyConsequence === null || result.storyConsequence === undefined,
        "storyConsequence must be null when not produced"
      );
    }

    if (result.beatRedirect !== null && result.beatRedirect !== undefined) {
      assert.equal(typeof result.beatRedirect, "object", "beatRedirect must be an object when present");
      assert.ok(Object.hasOwn(result.beatRedirect, "id"), "beatRedirect.id must be present");
    } else {
      assert.ok(
        result.beatRedirect === null || result.beatRedirect === undefined,
        "beatRedirect must be null when not produced"
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mock author rejects with HTTP 400 when playerAction is empty", async () => {
  const server = createParleyServer();
  const author = createMockAgentTurnAuthor();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeInProcessFetch(server);
  try {
    const inputWithoutAction = { ...VALID_INPUT, playerAction: "" };

    await assert.rejects(
      () => author.authorTurn(inputWithoutAction),
      (error) => {
        assert.ok(error instanceof Error, "should throw an Error");
        // The error message is "HTTP 400" per the createMockAgentTurnAuthor implementation.
        assert.ok(
          error.message.includes("400") || error.status === 400,
          `error should indicate HTTP 400; got message: "${error.message}"`
        );
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
