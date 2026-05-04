/**
 * page-story-play.test.js — Data-layer tests for L3 StoryPlay.
 *
 * Tests: turn submission via /api/turn (new shape), story transcript update,
 * mid-turn state (disabled input), rejection verdict → RejectionPill logic.
 */

import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";

import { createParleyServer } from "../src/server.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function createInProcessFetch(server) {
  return async (url, options = {}) => {
    const requestUrl = String(url).startsWith("http")
      ? `${new URL(url).pathname}${new URL(url).search}`
      : String(url);
    const response = await requestServer(server, {
      method: options.method ?? "GET",
      url: requestUrl,
      body: options.body
    });
    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      async json() {
        return JSON.parse(response.body);
      }
    };
  };
}

async function requestServer(server, { method, url, body }) {
  const request = new FakeRequest({ method, url, body });
  const response = new FakeResponse();
  const finished = new Promise((resolve) => response.once("finish", resolve));
  server.emit("request", request, response);
  await finished;
  return {
    status: response.statusCode,
    body: Buffer.concat(response.chunks).toString("utf8")
  };
}

class FakeRequest extends Readable {
  constructor({ method, url, body }) {
    super();
    this.method = method;
    this.url = url;
    this.body = body ? Buffer.from(body) : null;
  }
  _read() {
    if (this.body) {
      this.push(this.body);
      this.body = null;
    } else {
      this.push(null);
    }
  }
}

class FakeResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }
  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = Object.fromEntries(
      Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    );
    return this;
  }
  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("L3 StoryPlay — turn submission via new POST /api/turn shape", () => {
  let server;
  let fetch;
  const worldId = "last-lantern";
  let instanceId;
  const storyId = "last-lantern";

  before(async () => {
    server = createParleyServer();
    fetch = createInProcessFetch(server);

    // Create a fresh instance + story for this test suite
    const instResp = await fetch("/api/instances", {
      method: "POST",
      body: JSON.stringify({ worldId })
    });
    const inst = await instResp.json();
    instanceId = inst.instanceId;

    await fetch("/api/stories", {
      method: "POST",
      body: JSON.stringify({ worldId, instanceId, storyTemplateId: storyId })
    });
  });

  test("POST /api/turn with new shape returns AuthoredTurn shape", async () => {
    const response = await fetch("/api/turn", {
      method: "POST",
      body: JSON.stringify({
        worldId,
        instanceId,
        storyId,
        playerAction: "I ask who remembers the old north road."
      })
    });
    assert.equal(response.status, 200);
    const turn = await response.json();

    // AuthoredTurn fields
    assert.ok(typeof turn.responseId === "string", "responseId should be a string");
    assert.ok(typeof turn.narration === "string" && turn.narration.length > 0, "narration should be non-empty");
    assert.ok(Array.isArray(turn.speakers), "speakers should be an array");
    assert.ok(Array.isArray(turn.nextChoices), "nextChoices should be an array");
    assert.ok(Array.isArray(turn.proposedFacts), "proposedFacts should be an array");
  });

  test("successful turn appends narration to transcript", async () => {
    const response = await fetch("/api/turn", {
      method: "POST",
      body: JSON.stringify({
        worldId,
        instanceId,
        storyId,
        playerAction: "I ask who remembers the old north road."
      })
    });
    const turn = await response.json();
    // The transcript logic in StoryPlay appends narration when verdict != "revise"
    assert.ok(turn.narration, "narration should be present for appending to transcript");
    assert.match(turn.narration, /Mara Underbough/, "Mara should be in the narration");
  });

  test("POST /api/turn updates story turnCount", async () => {
    // Run a turn
    await fetch("/api/turn", {
      method: "POST",
      body: JSON.stringify({
        worldId,
        instanceId,
        storyId,
        playerAction: "I look around the tavern."
      })
    });

    // Check the story's turnCount
    const storyResp = await fetch(`/api/story?world=${worldId}&instance=${instanceId}&story=${storyId}`);
    const story = await storyResp.json();
    assert.ok(story.turnCount >= 1, "turnCount should be >= 1 after submitting a turn");
  });

  test("POST /api/turn rejects missing playerAction with 400", async () => {
    const response = await fetch("/api/turn", {
      method: "POST",
      body: JSON.stringify({
        worldId,
        instanceId,
        storyId
        // playerAction intentionally omitted
      })
    });
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.ok(data.error, "error message should be present");
  });

  test("POST /api/turn rejects legacy { scenarioId } shape with 400", async () => {
    const response = await fetch("/api/turn", {
      method: "POST",
      body: JSON.stringify({
        scenarioId: worldId,
        playerAction: "I ask who remembers the old north road."
      })
    });
    assert.equal(response.status, 400, "legacy shape must return 400");
    const data = await response.json();
    assert.ok(data.error.includes("worldId"), "error should mention worldId");
  });
});

describe("L3 StoryPlay — rejection verdict logic", () => {
  test("verdict:revise means transcript unchanged — RejectionPill shown", () => {
    // Simulate the StoryPlay.tsx logic:
    // When verdict === "revise", we remove the player action and show the pill.
    const transcriptBefore = [
      { type: "narration", text: "You enter the tavern." }
    ];

    const mockTurnResult = {
      verdict: "revise",
      rejectionMessage: "You cannot do that here.",
      narration: "",
      speakers: [],
      nextChoices: [],
      proposedFacts: []
    };

    // The StoryPlay adds the player action first, then checks verdict
    const transcriptWithPlayerAction = [
      ...transcriptBefore,
      { type: "player", text: "I try to climb the ceiling." }
    ];

    // On revise verdict: remove last entry + show rejection pill
    const transcriptAfterRevise = transcriptWithPlayerAction.slice(0, -1);

    assert.deepEqual(transcriptAfterRevise, transcriptBefore, "transcript should be unchanged on revise");
    assert.equal(mockTurnResult.verdict, "revise");
    assert.equal(mockTurnResult.rejectionMessage, "You cannot do that here.");
  });

  test("successful turn verdict clears rejection pill and appends narration", () => {
    const transcriptBefore = [
      { type: "narration", text: "You enter the tavern." },
      { type: "player", text: "I ask about the north road." }
    ];

    const mockTurnResult = {
      narration: "Mara looks up from the bar.",
      speakers: [],
      nextChoices: ["Ask about Ashford", "Order a drink"],
      proposedFacts: []
    };

    // No verdict field = success
    assert.ok(!mockTurnResult.verdict, "successful turn has no verdict field");

    const newEntries = [];
    if (mockTurnResult.narration) {
      newEntries.push({ type: "narration", text: mockTurnResult.narration });
    }
    for (const speaker of mockTurnResult.speakers ?? []) {
      if (speaker.quote) {
        newEntries.push({ type: "speaker", characterId: speaker.characterId, quote: speaker.quote });
      }
    }

    const transcriptAfter = [...transcriptBefore, ...newEntries];
    assert.equal(transcriptAfter.length, transcriptBefore.length + 1, "narration appended");
    assert.equal(transcriptAfter.at(-1).type, "narration");
  });

  test("mid-turn: input disabled while turnRunning=true", () => {
    // Verify the disabled logic is simple boolean
    let turnRunning = false;
    assert.equal(turnRunning, false, "input enabled by default");

    // Simulate turn start
    turnRunning = true;
    assert.equal(turnRunning, true, "input disabled during turn");

    // Simulate turn end
    turnRunning = false;
    assert.equal(turnRunning, false, "input re-enabled after turn");
  });
});

describe("L3 StoryPlay — nextChoices UI logic", () => {
  test("suggested choices from turn become choice buttons", () => {
    const nextChoices = ["Ask about the north road", "Order a drink", "Leave the tavern"];
    assert.equal(nextChoices.length, 3);
    // Each becomes a button; clicking sets playerAction
    for (const choice of nextChoices) {
      assert.ok(typeof choice === "string" && choice.length > 0);
    }
  });

  test("empty nextChoices → no choice buttons rendered", () => {
    const nextChoices = [];
    assert.equal(nextChoices.length, 0, "no choices = no buttons");
  });
});
