#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runPlayerTurn } from "../src/runtime/parleyRuntime.js";

const runtimeDir = await mkdtemp(path.join(tmpdir(), "parley-runtime-"));
const instanceDir = path.join(runtimeDir, "instance");
const worldDir = path.join(runtimeDir, "world");

await mkdir(instanceDir, { recursive: true });
await Promise.all([
  rm(path.join(instanceDir, "world-state.json"), { force: true }),
  rm(path.join(instanceDir, "turns.jsonl"), { force: true }),
  rm(path.join(instanceDir, "truth-verdicts.jsonl"), { force: true })
]);

const result = await runPlayerTurn({
  playerAction: "I ask who remembers the old north road.",
  instanceDir,
  worldDir
});

assert.match(result.narration, /Mara Underbough/);
assert.ok(
  result.characters.some((character) => character.id === "mara-underbough" && character.lifecycle === "resumable"),
  "Mara should be returned as a reusable resumable character"
);
assert.equal(result.truthVerdict.verdict, "pass");

for (const artifact of ["world-state.json", "turns.jsonl", "truth-verdicts.jsonl"]) {
  await stat(path.join(instanceDir, artifact));
}

const worldState = await readFile(path.join(instanceDir, "world-state.json"), "utf8");
const turns = await readFile(path.join(instanceDir, "turns.jsonl"), "utf8");
const truth = await readFile(path.join(instanceDir, "truth-verdicts.jsonl"), "utf8");

assert.match(worldState, /mara-underbough/);
assert.match(turns, /Mara Underbough/);
assert.match(truth, /parley-truth-verdict\/v1/);

console.log("Parley runtime smoke passed");
