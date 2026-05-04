import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getPublicEvents,
  getPublicRumors,
  getNpcPrivateBeliefs,
  getPromotionCandidates,
} from "../../src/runtime/indexer/indexer.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeSandbox() {
  return mkdtemp(path.join(tmpdir(), "parley-indexer-test-"));
}

// ─── getPublicEvents ──────────────────────────────────────────────────────────

test("getPublicEvents: returns parsed events from events.jsonl", async () => {
  const sandbox = await makeSandbox();
  const storyId = "story-001";
  const stateDir = path.join(sandbox, storyId, "state");
  await mkdir(stateDir, { recursive: true });

  const events = [
    { type: "npc.spoke", id: "evt-1", payload: "hello" },
    { type: "rumor.created", id: "evt-2", inputs: { summary: "A rumor about the king" } },
    { type: "beat.advanced", id: "evt-3" },
  ];
  await writeFile(
    path.join(stateDir, "events.jsonl"),
    events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    "utf8"
  );

  const result = await getPublicEvents({ instanceDir: sandbox, storyId });
  assert.equal(result.length, 3);
  assert.equal(result[0].type, "npc.spoke");
  assert.equal(result[1].type, "rumor.created");
  assert.equal(result[2].type, "beat.advanced");
});

test("getPublicEvents: typeFilter returns only matching events", async () => {
  const sandbox = await makeSandbox();
  const storyId = "story-002";
  const stateDir = path.join(sandbox, storyId, "state");
  await mkdir(stateDir, { recursive: true });

  const events = [
    { type: "npc.spoke", id: "evt-1" },
    { type: "rumor.created", id: "evt-2", inputs: { summary: "Some rumor" } },
    { type: "rumor.created", id: "evt-3", inputs: { summary: "Another rumor" } },
    { type: "beat.advanced", id: "evt-4" },
  ];
  await writeFile(
    path.join(stateDir, "events.jsonl"),
    events.map((e) => JSON.stringify(e)).join("\n"),
    "utf8"
  );

  const result = await getPublicEvents({ instanceDir: sandbox, storyId, typeFilter: "rumor.created" });
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.type === "rumor.created"));
});

test("getPublicEvents: returns [] when events.jsonl missing", async () => {
  const sandbox = await makeSandbox();
  const result = await getPublicEvents({ instanceDir: sandbox, storyId: "story-missing" });
  assert.deepEqual(result, []);
});

// ─── getPublicRumors ──────────────────────────────────────────────────────────

test("getPublicRumors: returns all rumor.created events when no mentions filter", async () => {
  const sandbox = await makeSandbox();
  const storyId = "story-003";
  const stateDir = path.join(sandbox, storyId, "state");
  await mkdir(stateDir, { recursive: true });

  const events = [
    { type: "npc.spoke", id: "evt-1" },
    { type: "rumor.created", id: "evt-2", inputs: { summary: "Rumor about the king" } },
    { type: "rumor.created", id: "evt-3", inputs: { summary: "Rumor about the queen" } },
  ];
  await writeFile(
    path.join(stateDir, "events.jsonl"),
    events.map((e) => JSON.stringify(e)).join("\n"),
    "utf8"
  );

  const result = await getPublicRumors({ instanceDir: sandbox, storyId });
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.type === "rumor.created"));
});

test("getPublicRumors: filters by mentions substring (case-insensitive)", async () => {
  const sandbox = await makeSandbox();
  const storyId = "story-004";
  const stateDir = path.join(sandbox, storyId, "state");
  await mkdir(stateDir, { recursive: true });

  const events = [
    { type: "rumor.created", id: "evt-1", inputs: { summary: "Rumor about the King" } },
    { type: "rumor.created", id: "evt-2", inputs: { summary: "Rumor about the queen" } },
    { type: "rumor.created", id: "evt-3", inputs: { summary: "Strange happenings at the market" } },
  ];
  await writeFile(
    path.join(stateDir, "events.jsonl"),
    events.map((e) => JSON.stringify(e)).join("\n"),
    "utf8"
  );

  const result = await getPublicRumors({ instanceDir: sandbox, storyId, mentions: "king" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "evt-1");
});

test("getPublicRumors: returns [] when events.jsonl missing", async () => {
  const sandbox = await makeSandbox();
  const result = await getPublicRumors({ instanceDir: sandbox, storyId: "story-missing" });
  assert.deepEqual(result, []);
});

// ─── getNpcPrivateBeliefs ─────────────────────────────────────────────────────

test("getNpcPrivateBeliefs: reads MEMORY.md and parses JSON-line entries", async () => {
  const sandbox = await makeSandbox();
  const cragSlug = "stonepeak";
  const characterId = "innkeeper";
  const profileDir = path.join(sandbox, `blyr-${cragSlug}-${characterId}`);
  await mkdir(profileDir, { recursive: true });

  const entries = [
    { story_id: "story-001", belief: "The king is corrupt", confidence: 0.9 },
    { story_id: "story-002", belief: "The merchant is trustworthy", confidence: 0.7 },
  ];
  const memoryContent = [
    "# Private Beliefs",
    "",
    ...entries.map((e) => JSON.stringify(e)),
    "",
    "Some non-JSON line that should be ignored",
  ].join("\n");

  await writeFile(path.join(profileDir, "MEMORY.md"), memoryContent, "utf8");

  const result = await getNpcPrivateBeliefs({
    hermesProfilesRoot: sandbox,
    cragSlug,
    characterId,
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].belief, "The king is corrupt");
  assert.equal(result[1].belief, "The merchant is trustworthy");
});

test("getNpcPrivateBeliefs: filters by storyIdFilter", async () => {
  const sandbox = await makeSandbox();
  const cragSlug = "stonepeak";
  const characterId = "guard";
  const profileDir = path.join(sandbox, `blyr-${cragSlug}-${characterId}`);
  await mkdir(profileDir, { recursive: true });

  const entries = [
    { story_id: "story-001", belief: "The gate is weak" },
    { story_id: "story-002", belief: "The captain is hiding something" },
    { story_id: "story-001", belief: "A stranger was seen at midnight" },
  ];
  await writeFile(
    path.join(profileDir, "MEMORY.md"),
    entries.map((e) => JSON.stringify(e)).join("\n"),
    "utf8"
  );

  const result = await getNpcPrivateBeliefs({
    hermesProfilesRoot: sandbox,
    cragSlug,
    characterId,
    storyIdFilter: "story-001",
  });
  assert.equal(result.length, 2);
  assert.ok(result.every((b) => b.story_id === "story-001"));
});

test("getNpcPrivateBeliefs: returns [] when MEMORY.md missing", async () => {
  const sandbox = await makeSandbox();
  const result = await getNpcPrivateBeliefs({
    hermesProfilesRoot: sandbox,
    cragSlug: "nonexistent",
    characterId: "ghost",
  });
  assert.deepEqual(result, []);
});

// ─── getPromotionCandidates ───────────────────────────────────────────────────

test("getPromotionCandidates: reads world-instance-evaluation.json and returns promotion_candidates", async () => {
  const sandbox = await makeSandbox();
  const storyId = "story-005";
  const storyDir = path.join(sandbox, storyId);
  await mkdir(storyDir, { recursive: true });

  const evalData = {
    schema_version: "parley-world-instance-evaluation/v1",
    story_id: storyId,
    promotion_candidates: [
      { id: "cand-1", fact: "The king died at dawn" },
      { id: "cand-2", fact: "The assassin was never found" },
    ],
  };
  await writeFile(
    path.join(storyDir, "world-instance-evaluation.json"),
    JSON.stringify(evalData, null, 2),
    "utf8"
  );

  const result = await getPromotionCandidates({ instanceDir: sandbox, storyId });
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "cand-1");
  assert.equal(result[1].id, "cand-2");
});

test("getPromotionCandidates: returns [] when evaluation file missing", async () => {
  const sandbox = await makeSandbox();
  const result = await getPromotionCandidates({ instanceDir: sandbox, storyId: "story-missing" });
  assert.deepEqual(result, []);
});

test("getPromotionCandidates: returns [] when promotion_candidates key absent", async () => {
  const sandbox = await makeSandbox();
  const storyId = "story-006";
  const storyDir = path.join(sandbox, storyId);
  await mkdir(storyDir, { recursive: true });

  await writeFile(
    path.join(storyDir, "world-instance-evaluation.json"),
    JSON.stringify({ schema_version: "parley-world-instance-evaluation/v1", story_id: storyId }),
    "utf8"
  );

  const result = await getPromotionCandidates({ instanceDir: sandbox, storyId });
  assert.deepEqual(result, []);
});

// ─── CRITICAL: No write exports ───────────────────────────────────────────────

test("indexer.js exports NO write functions", async () => {
  const mod = await import("../../src/runtime/indexer/indexer.js");
  const exportedNames = Object.keys(mod);

  // Assert all expected read-only query exports are present.
  const expectedExports = [
    "getNpcPrivateBeliefs",
    "getPublicEvents",
    "getPublicRumors",
    "getPromotionCandidates",
  ];
  for (const name of expectedExports) {
    assert.ok(exportedNames.includes(name), `Expected export missing: ${name}`);
  }

  // Assert that no write-style function names are exported.
  const writePatterns = [/write/i, /append/i, /save/i, /create/i, /update/i, /delete/i, /remove/i, /mutate/i, /set/i, /put/i, /post/i, /patch/i, /promote/i];
  for (const name of exportedNames) {
    for (const pattern of writePatterns) {
      assert.ok(
        !pattern.test(name),
        `indexer.js must not export write functions, but found: "${name}" matching pattern ${pattern}`
      );
    }
  }

  // Assert the module exports exactly the four query functions and nothing else.
  assert.deepEqual(
    exportedNames.sort(),
    expectedExports.sort(),
    "indexer.js must export exactly the four query functions"
  );
});
