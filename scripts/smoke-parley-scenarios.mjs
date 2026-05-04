#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runPlayerTurn } from "../src/runtime/parleyRuntime.js";
import { listScenarioPacks } from "../src/runtime/scenarioPacks.js";

const expectedScenarios = new Map([
  ["last-lantern", {
    action: "I ask who remembers the old north road.",
    character: "Mara Underbough",
    phrase: /old north road|Ashford/i,
    themeId: "last-lantern"
  }],
  ["neon-afterhours", {
    action: "I ask who signed the audit lockout.",
    character: "Veyra Sol",
    phrase: /audit|Kestrel-9|Meridian/i,
    themeId: "cyberpunk"
  }],
  ["orchard-welcome", {
    action: "I ask who keeps leaving lantern pears at my gate.",
    character: "June Bellweather",
    phrase: /lantern pears|blue cloth|Mossgrove/i,
    themeId: "cozy"
  }]
]);

const scenarios = await listScenarioPacks();
assert.deepEqual(
  scenarios.map((scenario) => scenario.id).sort(),
  [...expectedScenarios.keys()].sort()
);

const results = [];

for (const scenario of scenarios) {
  const expected = expectedScenarios.get(scenario.id);
  assert.ok(expected, `unexpected scenario ${scenario.id}`);
  assert.equal(scenario.themeId, expected.themeId);
  assert.equal(scenario.defaultPlayerAction, expected.action);

  const rootDir = await mkdtemp(path.join(tmpdir(), `parley-${scenario.id}-`));
  const instanceDir = path.join(rootDir, "instance");
  const worldDir = path.join(rootDir, "world");
  const result = await runPlayerTurn({
    scenarioId: scenario.id,
    playerAction: scenario.defaultPlayerAction,
    instanceDir,
    worldDir
  });

  assert.equal(result.committed, true);
  assert.equal(result.scenario.id, scenario.id);
  assert.equal(result.scenario.themeId, expected.themeId);
  assert.match(result.narration, new RegExp(expected.character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.narration, expected.phrase);
  assert.ok(result.characters.some((character) => character.name === expected.character));
  assert.ok(result.nextChoices.length >= 3);
  assert.equal(result.truthVerdict.verdict, "pass");
  assert.ok(result.truthVerdict.accepted_facts.length >= 1, `${scenario.id} should establish canon`);
  assert.ok(result.truthVerdict.rumors.length >= 1, `${scenario.id} should track rumors`);
  assert.ok(result.truthVerdict.leads.length >= 1, `${scenario.id} should track leads`);
  assert.ok(result.truthVerdict.unresolved.length >= 1, `${scenario.id} should track unresolved threads`);

  const worldStatePath = path.join(instanceDir, "world-state.json");
  const turnsPath = path.join(instanceDir, "turns.jsonl");
  const truthPath = path.join(instanceDir, "truth-verdicts.jsonl");
  await Promise.all([stat(worldStatePath), stat(turnsPath), stat(truthPath)]);

  const [worldState, turns, truth] = await Promise.all([
    readFile(worldStatePath, "utf8"),
    readFile(turnsPath, "utf8"),
    readFile(truthPath, "utf8")
  ]);
  assert.match(worldState, new RegExp(`"scenario_id": "${scenario.id}"`));
  assert.match(turns, new RegExp(scenario.defaultPlayerAction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(truth, /"category":"lead"|"category": "lead"/);

  results.push({ scenario, result });
}

const narrations = new Set(results.map(({ result }) => result.narration));
assert.equal(narrations.size, results.length, "each scenario should produce distinct narration");

console.log("Parley scenario pack smoke passed");
console.log("");
for (const { scenario, result } of results) {
  console.log(`## ${scenario.title} (${scenario.id}, theme=${scenario.themeId})`);
  console.log(result.narration);
  console.log("");
  console.log(`Characters: ${result.characters.map((character) => character.name).join(", ")}`);
  console.log(`Leads: ${result.truthVerdict.leads.map((fact) => fact.text).join(" | ")}`);
  console.log(`Unresolved: ${result.truthVerdict.unresolved.map((fact) => fact.text).join(" | ")}`);
  console.log("");
}
