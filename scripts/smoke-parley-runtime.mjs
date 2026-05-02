#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPlayerTurn } from "../src/runtime/parleyRuntime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = path.join(root, "worlds", "last-lantern", "state");

await mkdir(stateDir, { recursive: true });
await Promise.all([
  rm(path.join(stateDir, "world-state.json"), { force: true }),
  rm(path.join(stateDir, "turns.jsonl"), { force: true }),
  rm(path.join(stateDir, "truth-verdicts.jsonl"), { force: true })
]);

const result = await runPlayerTurn({
  playerAction: "I ask who remembers the old north road.",
  stateDir
});

assert.match(result.narration, /Mara Underbough/);
assert.ok(
  result.characters.some((character) => character.id === "mara-underbough" && character.lifecycle === "resumable"),
  "Mara should be returned as a reusable resumable character"
);
assert.equal(result.truthVerdict.verdict, "pass");

for (const artifact of ["world-state.json", "turns.jsonl", "truth-verdicts.jsonl"]) {
  await stat(path.join(stateDir, artifact));
}

const worldState = await readFile(path.join(stateDir, "world-state.json"), "utf8");
const turns = await readFile(path.join(stateDir, "turns.jsonl"), "utf8");
const truth = await readFile(path.join(stateDir, "truth-verdicts.jsonl"), "utf8");

assert.match(worldState, /mara-underbough/);
assert.match(turns, /Mara Underbough/);
assert.match(truth, /parley-truth-verdict\/v1/);

console.log("Parley runtime smoke passed");
