#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPlayerTurn } from "../src/runtime/parleyRuntime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = path.join(root, "worlds", "last-lantern", "state");
const playerAction = "I ask who remembers the old north road.";

await mkdir(stateDir, { recursive: true });
await Promise.all([
  rm(path.join(stateDir, "world-state.json"), { force: true }),
  rm(path.join(stateDir, "turns.jsonl"), { force: true }),
  rm(path.join(stateDir, "truth-verdicts.jsonl"), { force: true })
]);

const result = await runPlayerTurn({ playerAction, stateDir });

const worldStatePath = path.join(stateDir, "world-state.json");
const turnsPath = path.join(stateDir, "turns.jsonl");
const truthPath = path.join(stateDir, "truth-verdicts.jsonl");
const uiSource = await Promise.all([
  readFile(path.join(root, "src", "client", "index.html"), "utf8"),
  readFile(path.join(root, "src", "client", "app.js"), "utf8"),
  readFile(path.join(root, "src", "client", "styles.css"), "utf8")
]).then((parts) => parts.join("\n"));

assert.match(result.narration, /Mara Underbough/);
assert.match(result.narration, /old north road/i);
assert.match(result.narration, /Ashford/i);
assert.match(result.narration, /lead|thread|trail/i);

const mara = result.characters.find((character) => character.id === "mara-underbough");
assert.ok(mara, "Mara should be returned as a reusable NPC");
assert.equal(mara.reusable, true);
assert.equal(mara.lifecycle, "resumable");

assert.ok(result.truthVerdict.rumors.length > 0, "truth memory should keep a rumor");
assert.ok(result.truthVerdict.leads.length > 0, "truth memory should keep a lead");
assert.ok(result.truthVerdict.unresolved.length > 0, "truth memory should keep an unresolved mystery");

assert.doesNotMatch(
  result.narration,
  /\byou (feel|think|realize|remember|know|decide|want|fear|hope)\b/i,
  "narration should not decide player feelings or thoughts"
);

for (const artifactPath of [worldStatePath, turnsPath, truthPath]) {
  await stat(artifactPath);
}

const [worldState, turns, truth] = await Promise.all([
  readFile(worldStatePath, "utf8"),
  readFile(turnsPath, "utf8"),
  readFile(truthPath, "utf8")
]);
assert.match(worldState, /mara-underbough/);
assert.match(worldState, /old-north-road-lead/);
assert.match(turns, /I ask who remembers the old north road\./);
assert.match(truth, /old-north-road-rumor/);
assert.match(truth, /ashford-name-mystery/);

for (const theme of ["last-lantern", "cyberpunk", "cozy"]) {
  assert.match(uiSource, new RegExp(`data-theme="${theme}"|value="${theme}"|\\[data-theme="${theme}"\\]`));
}

const checks = [
  "Mara answers the old north road prompt",
  "Ashford remains a lead instead of solved lore",
  "Mara is reusable and resumable",
  "Story memory records rumor, lead, and unresolved mystery",
  "Narration does not decide player feelings or thoughts",
  "State artifacts were persisted",
  "UI source exposes three theme presets"
];

console.log("Parley narrative e2e smoke");
console.log("");
console.log("Narration:");
console.log(result.narration);
console.log("");
console.log("Checks:");
for (const check of checks) {
  console.log(`- ${check}`);
}
