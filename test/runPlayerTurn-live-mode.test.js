/**
 * runPlayerTurn-live-mode.test.js
 *
 * Tests for the useLiveAuthor + useLiveTruthJudge flags added in Wave C.
 *
 * Uses injectable factory overrides (_liveAuthorFactory, _liveTruthJudgeFactory)
 * to verify that the live path is taken when flags are set, without needing a
 * real Belayer daemon.
 *
 * Legacy fixture path tests live in parley-runtime.test.js (untouched).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runPlayerTurn } from "../src/runtime/parleyRuntime.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir() {
  return mkdtemp(path.join(tmpdir(), "parley-live-mode-test-"));
}

/**
 * Create a minimal materialized instance directory with a manifest.json.
 */
async function makeInstanceDir({ instanceId = "test-instance-default" } = {}) {
  const dir = await makeTmpDir();
  const manifest = {
    schema_version: "parley-instance-manifest/v1",
    world_id: "last-lantern",
    instance_id: instanceId,
    crag_slug: instanceId,
    created_at: new Date().toISOString(),
  };
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return dir;
}

/**
 * Build a minimal authored turn that satisfies normalizeAuthoredTurn.
 */
function makeMinimalAuthoredTurn(turnId = "turn-0001") {
  return {
    responseId: `live-response-${turnId}`,
    narration: "The live storyteller narrated this turn.",
    nextChoices: ["Do something", "Do something else"],
    proposedFacts: [
      {
        id: `fact-${turnId}`,
        category: "rumor",
        text: "A rumor from the live storyteller.",
        evidence_turn: turnId,
      },
    ],
    handledRejectedClaims: [],
    actionInterpretation: null,
    detourScene: null,
    storyConsequence: null,
    beatRedirect: null,
    authoring: { author: "belayer-storyteller", mode: "live", response_id: `live-response-${turnId}` },
  };
}

/**
 * Build a minimal passing truth verdict.
 */
function makePassingVerdict(turnId = "turn-0001") {
  return {
    id: `${turnId}-truth`,
    schema_version: "parley-truth-verdict/v1",
    turn_id: turnId,
    verdict: "pass",
    accepted_facts: [],
    rejected_claims: [],
    rumors: [{ id: `rumor-${turnId}`, text: "A rumor.", category: "rumor" }],
    leads: [],
    character_beliefs: [],
    unresolved: [],
    author_only_hidden_truth: [],
  };
}

/**
 * Build a minimal scenario path (uses the default last-lantern pack).
 */
function getDefaultScenePath() {
  return path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "examples",
    "last-lantern",
    "scene.yaml"
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("live mode: useLiveAuthor + useLiveTruthJudge — injectable factories called instead of mocks", async () => {
  const instanceDir = await makeInstanceDir({ instanceId: "test-instance-default" });
  const stateDir = await makeTmpDir();

  // Track which factories were called
  let authorFactoryCalled = false;
  let judgeFactoryCalled = false;
  const authorFactoryArgs = [];
  const judgeFactoryArgs = [];

  // Mock author factory returns a deterministic author
  const mockAuthorFactory = (opts) => {
    authorFactoryCalled = true;
    authorFactoryArgs.push(opts);
    return {
      id: "mock-live-author",
      mode: "live",
      authorTurn: async ({ turnId }) => makeMinimalAuthoredTurn(turnId),
    };
  };

  // Mock judge factory returns a deterministic judge
  const mockJudgeFactory = (opts) => {
    judgeFactoryCalled = true;
    judgeFactoryArgs.push(opts);
    return async ({ turnId }) => makePassingVerdict(turnId);
  };

  const result = await runPlayerTurn({
    playerAction: "I look around the tavern.",
    stateDir,
    instanceDir,
    useLiveAuthor: true,
    useLiveTruthJudge: true,
    _liveAuthorFactory: mockAuthorFactory,
    _liveTruthJudgeFactory: mockJudgeFactory,
  });

  // Live factories must have been called
  assert.ok(authorFactoryCalled, "live author factory should have been called");
  assert.ok(judgeFactoryCalled, "live judge factory should have been called");

  // Factories received correct worldInstanceId + storyId
  assert.equal(
    authorFactoryArgs[0].worldInstanceId,
    "test-instance-default",
    "author factory should receive worldInstanceId from manifest"
  );
  assert.ok(authorFactoryArgs[0].storyId, "author factory should receive storyId");

  assert.equal(
    judgeFactoryArgs[0].worldInstanceId,
    "test-instance-default",
    "judge factory should receive worldInstanceId from manifest"
  );

  // Turn committed (verdict = pass)
  assert.ok(result.committed, "turn should be committed");
  assert.equal(result.truthVerdict.verdict, "pass", "verdict should pass");
  assert.ok(result.narration.includes("live storyteller"), "narration should come from live author");
});

test("live mode: useLiveAuthor=false — fixture author used regardless of useLiveTruthJudge", async () => {
  const instanceDir = await makeInstanceDir({ instanceId: "test-instance-default" });
  const stateDir = await makeTmpDir();

  let authorFactoryCalled = false;

  const mockAuthorFactory = () => {
    authorFactoryCalled = true;
    return { id: "should-not-be-called", mode: "live", authorTurn: async () => ({}) };
  };

  // Should use default createScenarioFixtureAuthor, not the mock factory
  // (which would fail if called because authorTurn returns empty object)
  await assert.doesNotReject(async () => {
    await runPlayerTurn({
      playerAction: "I sit by the fire.",
      stateDir,
      instanceDir,
      useLiveAuthor: false,
      useLiveTruthJudge: true,
      _liveAuthorFactory: mockAuthorFactory,
    });
  });

  assert.equal(authorFactoryCalled, false, "live author factory should NOT be called when useLiveAuthor=false");
});

test("live mode: useLiveTruthJudge=false — fixture judge used regardless of useLiveAuthor", async () => {
  const instanceDir = await makeInstanceDir({ instanceId: "test-instance-default" });
  const stateDir = await makeTmpDir();

  let judgeFactoryCalled = false;

  const mockJudgeFactory = () => {
    judgeFactoryCalled = true;
    return async () => ({});
  };

  // Should use default judgeTurn, not the mock factory
  await assert.doesNotReject(async () => {
    await runPlayerTurn({
      playerAction: "I ask about the rumors.",
      stateDir,
      instanceDir,
      useLiveAuthor: true,
      useLiveTruthJudge: false,
      _liveAuthorFactory: () => ({
        id: "mock-author",
        mode: "live",
        authorTurn: async ({ turnId }) => makeMinimalAuthoredTurn(turnId),
      }),
      _liveTruthJudgeFactory: mockJudgeFactory,
    });
  });

  assert.equal(judgeFactoryCalled, false, "live judge factory should NOT be called when useLiveTruthJudge=false");
});

test("live mode: no instanceDir — falls back to fixture path (live flags require instanceDir to activate)", async () => {
  const stateDir = await makeTmpDir();

  let authorFactoryCalled = false;
  let judgeFactoryCalled = false;

  // Even though live flags are set, without instanceDir the live path is skipped silently.
  await assert.doesNotReject(async () => {
    await runPlayerTurn({
      playerAction: "I try something.",
      stateDir,
      // instanceDir intentionally omitted — live path requires instanceDir
      useLiveAuthor: true,
      useLiveTruthJudge: true,
      _liveAuthorFactory: () => {
        authorFactoryCalled = true;
        return { id: "x", mode: "live", authorTurn: async () => ({}) };
      },
      _liveTruthJudgeFactory: () => {
        judgeFactoryCalled = true;
        return async () => ({});
      },
    });
  });

  // Without instanceDir, the live path is NOT activated even with the flags set.
  assert.equal(authorFactoryCalled, false, "live author factory should NOT be called without instanceDir");
  assert.equal(judgeFactoryCalled, false, "live judge factory should NOT be called without instanceDir");
});

test("live mode: bad manifest (instanceDir points to missing manifest) — throws", async () => {
  const stateDir = await makeTmpDir();
  const badInstanceDir = await makeTmpDir();
  // Do NOT write manifest.json

  await assert.rejects(
    async () => {
      await runPlayerTurn({
        playerAction: "I do something.",
        stateDir,
        instanceDir: badInstanceDir,
        useLiveAuthor: true,
        useLiveTruthJudge: true,
        _liveAuthorFactory: () => ({ id: "x", mode: "live", authorTurn: async () => ({}) }),
        _liveTruthJudgeFactory: () => async () => ({}),
      });
    },
    (err) => {
      assert.ok(err instanceof Error, "should throw Error");
      return true;
    }
  );
});

test("live mode: backward compat — neither flag set, works as before", async () => {
  const stateDir = await makeTmpDir();

  // No live flags, no instanceDir — should use legacy fixture author + judgeTurn
  await assert.doesNotReject(async () => {
    await runPlayerTurn({
      playerAction: "I greet Mara.",
      stateDir,
      // useLiveAuthor: false (default)
      // useLiveTruthJudge: false (default)
    });
  });
});
