import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { promoteFromEval } from "../../src/runtime/indexer/promoteFromEval.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeSandbox() {
  return mkdtemp(path.join(tmpdir(), "parley-promote-test-"));
}

function makeEvalArtifact(candidates) {
  return {
    schema_version: "parley-world-instance-evaluation/v1",
    story_id: "story-001",
    promotion_candidates: candidates,
  };
}

async function writeEvalArtifact(dir, candidates, filename = "world-instance-evaluation.json") {
  const evalPath = path.join(dir, filename);
  await writeFile(evalPath, JSON.stringify(makeEvalArtifact(candidates), null, 2), "utf8");
  return evalPath;
}

function mockBelayerPromote({ ok = true, stderr = "" } = {}) {
  const calls = [];
  const fn = async ({ evalPath, accepted }) => {
    calls.push({ evalPath, accepted });
    return { ok, stderr };
  };
  fn.calls = calls;
  return fn;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("promoteFromEval: all-accept happy path — candidates appended to lore/promoted-facts.jsonl with timestamps", async () => {
  const sandbox = await makeSandbox();
  const worldDir = path.join(sandbox, "worlds", "world-alpha");
  await mkdir(worldDir, { recursive: true });

  const candidates = [
    { id: "cand-1", fact: "The king died at dawn" },
    { id: "cand-2", fact: "The assassin fled south" },
  ];
  const evalPath = await writeEvalArtifact(sandbox, candidates);
  const belayerPromote = mockBelayerPromote({ ok: true });

  const result = await promoteFromEval({
    evalArtifactPath: evalPath,
    worldDir,
    acceptCandidate: async () => true,
    belayerPromote,
  });

  assert.ok(result.ok, "result.ok should be true");
  assert.equal(result.accepted.length, 2);
  assert.equal(result.rejected.length, 0);
  assert.ok(result.belayerInvoked, "belayer should have been invoked");
  assert.ok(result.promotedPath, "promotedPath should be set");

  // Read the written file and verify contents.
  const raw = await readFile(result.promotedPath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  assert.equal(lines.length, 2);

  const written = lines.map((l) => JSON.parse(l));
  assert.equal(written[0].id, "cand-1");
  assert.equal(written[1].id, "cand-2");
  // Each entry must have promoted_at timestamp.
  assert.ok(written[0].promoted_at, "promoted_at must be set on first entry");
  assert.ok(written[1].promoted_at, "promoted_at must be set on second entry");
  // Each entry must have source_eval.
  assert.equal(written[0].source_eval, "world-instance-evaluation.json");
  assert.equal(written[1].source_eval, "world-instance-evaluation.json");

  // Belayer was called once with the eval path.
  assert.equal(belayerPromote.calls.length, 1);
  assert.equal(belayerPromote.calls[0].evalPath, evalPath);
});

test("promoteFromEval: acceptCandidate returns false — candidate skipped, no belayer invocation", async () => {
  const sandbox = await makeSandbox();
  const worldDir = path.join(sandbox, "worlds", "world-beta");
  await mkdir(worldDir, { recursive: true });

  const candidates = [{ id: "cand-1", fact: "The gate was left open" }];
  const evalPath = await writeEvalArtifact(sandbox, candidates);
  const belayerPromote = mockBelayerPromote({ ok: true });

  const result = await promoteFromEval({
    evalArtifactPath: evalPath,
    worldDir,
    acceptCandidate: async () => false,
    belayerPromote,
  });

  assert.ok(result.ok);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.belayerInvoked, false);
  assert.equal(belayerPromote.calls.length, 0, "belayer must not be called when nothing accepted");
});

test("promoteFromEval: mixed accept/reject — some accepted, some rejected", async () => {
  const sandbox = await makeSandbox();
  const worldDir = path.join(sandbox, "worlds", "world-gamma");
  await mkdir(worldDir, { recursive: true });

  const candidates = [
    { id: "cand-1", fact: "A" },
    { id: "cand-2", fact: "B" },
    { id: "cand-3", fact: "C" },
  ];
  const evalPath = await writeEvalArtifact(sandbox, candidates);
  const belayerPromote = mockBelayerPromote({ ok: true });

  // Accept only odd-indexed candidates.
  let callCount = 0;
  const acceptCandidate = async (_cand) => {
    const accept = callCount % 2 === 0;
    callCount++;
    return accept;
  };

  const result = await promoteFromEval({
    evalArtifactPath: evalPath,
    worldDir,
    acceptCandidate,
    belayerPromote,
  });

  assert.ok(result.ok);
  assert.equal(result.accepted.length, 2); // cand-1 and cand-3
  assert.equal(result.rejected.length, 1); // cand-2
  assert.ok(result.belayerInvoked);

  // Verify only accepted candidates written to lore.
  const raw = await readFile(result.promotedPath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  assert.equal(lines.length, 2);
  const written = lines.map((l) => JSON.parse(l));
  assert.equal(written[0].id, "cand-1");
  assert.equal(written[1].id, "cand-3");
});

test("promoteFromEval: belayerPromote returns ok:false — returns failure without writing to lore", async () => {
  const sandbox = await makeSandbox();
  const worldDir = path.join(sandbox, "worlds", "world-delta");
  await mkdir(worldDir, { recursive: true });

  const candidates = [{ id: "cand-1", fact: "A contested fact" }];
  const evalPath = await writeEvalArtifact(sandbox, candidates);
  const belayerPromote = mockBelayerPromote({ ok: false, stderr: "belayer: promotion rejected by remote" });

  const result = await promoteFromEval({
    evalArtifactPath: evalPath,
    worldDir,
    acceptCandidate: async () => true,
    belayerPromote,
  });

  assert.equal(result.ok, false, "result.ok should be false on belayer failure");
  assert.ok(result.belayerInvoked, "belayer was still invoked");
  assert.ok(result.error, "error field should be set");
  assert.match(result.error, /belayer: promotion rejected by remote/);

  // Lore file must NOT have been written.
  const lorePath = path.join(worldDir, "lore", "promoted-facts.jsonl");
  const loreExists = await readFile(lorePath, "utf8").then(() => true).catch(() => false);
  assert.equal(loreExists, false, "promoted-facts.jsonl must not be created on belayer failure");
});

test("promoteFromEval: empty candidates list — ok:true with no belayer invocation", async () => {
  const sandbox = await makeSandbox();
  const worldDir = path.join(sandbox, "worlds", "world-epsilon");
  await mkdir(worldDir, { recursive: true });

  const evalPath = await writeEvalArtifact(sandbox, []); // No candidates
  const belayerPromote = mockBelayerPromote({ ok: true });

  const result = await promoteFromEval({
    evalArtifactPath: evalPath,
    worldDir,
    acceptCandidate: async () => true,
    belayerPromote,
  });

  assert.ok(result.ok);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.belayerInvoked, false);
  assert.equal(belayerPromote.calls.length, 0);
});
