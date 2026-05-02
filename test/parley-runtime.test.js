import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runPlayerTurn } from "../src/runtime/parleyRuntime.js";

test("player input creates Mara response, reusable character, and artifacts", async () => {
  const stateDir = await mkdtemp(path.join(tmpdir(), "parley-last-lantern-"));

  const result = await runPlayerTurn({
    playerAction: "I ask who remembers the old north road.",
    stateDir
  });

  assert.match(result.narration, /Mara Underbough/);
  assert.match(result.narration, /old north road/i);
  assert.ok(result.nextChoices.length >= 3);

  const mara = result.characters.find((character) => character.id === "mara-underbough");
  assert.ok(mara, "Mara should appear in the reusable NPC list");
  assert.equal(mara.lifecycle, "resumable");
  assert.equal(mara.belayerGeneratedTalent.domain, "story");
  assert.equal(mara.belayerGeneratedTalent.role, "tavernkeep");
  assert.ok(mara.tags.includes("location:last-lantern-tavern"));
  assert.ok(mara.tags.includes("scene:last-lantern-tavern"));

  assert.equal(result.truthVerdict.schema_version, "parley-truth-verdict/v1");
  assert.equal(result.truthVerdict.verdict, "pass");
  assert.ok(result.truthVerdict.accepted_facts.length >= 1);
  assert.ok(result.truthVerdict.rumors.length >= 1);
  assert.ok(result.truthVerdict.unresolved.length >= 1);

  await stat(path.join(stateDir, "world-state.json"));
  await stat(path.join(stateDir, "turns.jsonl"));
  await stat(path.join(stateDir, "truth-verdicts.jsonl"));

  const turns = await readFile(path.join(stateDir, "turns.jsonl"), "utf8");
  assert.match(turns, /I ask who remembers the old north road\./);
  assert.match(turns, /Mara Underbough/);

  const truth = await readFile(path.join(stateDir, "truth-verdicts.jsonl"), "utf8");
  assert.match(truth, /old-north-road/);
  assert.match(truth, /rumor/);
});
