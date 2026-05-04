import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadScenarioPack } from "../src/runtime/scenarioPacks.js";
import { runPlayerTurn } from "../src/runtime/parleyRuntime.js";

test("loadScenarioPack emits instanceDir under instances/<world-id>/playthrough-1 and no stateDir", async () => {
  const scenario = await loadScenarioPack("last-lantern");

  assert.match(scenario.instanceDir, /instances\/last-lantern\/playthrough-1$/);
  assert.match(scenario.worldDir, /worlds\/last-lantern$/);
  assert.equal(scenario.stateDir, undefined, "stateDir is no longer emitted");
});

test("loadScenarioPack reads scenario.json from worlds/<world-id>/scenarios/<scenario-id>/", async () => {
  const scenario = await loadScenarioPack("neon-afterhours");

  assert.match(
    scenario.scenarioPath,
    /worlds\/neon-afterhours\/scenarios\/neon-afterhours\/scenario\.json$/
  );
});

test("runPlayerTurn materializes the instance directory on first turn (idempotent)", async () => {
  const tmpInstance = await mkdtemp(path.join(tmpdir(), "parley-instance-mat-"));
  try {
    await runPlayerTurn({
      scenarioId: "last-lantern",
      playerAction: "I ask who remembers the old north road.",
      instanceDir: tmpInstance
    });

    const turnsStat = await stat(path.join(tmpInstance, "turns.jsonl"));
    assert.ok(turnsStat.isFile(), "turns.jsonl was written under the materialized instance dir");

    // Idempotent: a second invocation with the same instanceDir does not throw.
    await runPlayerTurn({
      scenarioId: "last-lantern",
      playerAction: "I ask who remembers the old north road.",
      instanceDir: tmpInstance
    });
  } finally {
    await rm(tmpInstance, { recursive: true, force: true });
  }
});

test("missing scenario.json under worlds/<world-id>/scenarios/ raises a clear error", async () => {
  await assert.rejects(
    () => loadScenarioPack("nonexistent-world"),
    (err) =>
      err.code === "ENOENT" ||
      String(err.message).toLowerCase().includes("nonexistent-world")
  );
});
