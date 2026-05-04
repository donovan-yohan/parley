import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runPlayerTurn } from "../src/runtime/parleyRuntime.js";
import { loadScenarioPack } from "../src/runtime/scenarioPacks.js";
import {
  createDetourScene,
  interpretPlayerAction,
  recordStoryConsequence,
  routeToAttractor
} from "../src/runtime/dm/detourTools.js";
import {
  validateActionInterpretation,
  validateBeatRedirect,
  validateDetourScene,
  validateStoryConsequence
} from "../src/runtime/dm/detourContracts.js";

test("detour contract validators reject malformed DM artifacts", () => {
  assert.throws(
    () => validateActionInterpretation({ schema_version: "wrong", turn_id: "turn-0003" }),
    /parley-action-interpretation\/v1/
  );

  assert.throws(
    () => validateDetourScene({
      schema_version: "parley-detour-scene/v1",
      id: "detour-empty",
      source_turn_id: "turn-0003",
      scope: "story_instance",
      title: "Empty",
      purpose: "Missing attractors must fail.",
      target_attractor_ids: [],
      entry_state: {},
      exit_conditions: ["step down"],
      expires_after: "scene_resolution"
    }),
    /target_attractor_ids/
  );

  assert.throws(
    () => validateStoryConsequence({
      schema_version: "parley-story-consequence/v1",
      id: "consequence-missing-summary",
      source_turn_id: "turn-0003",
      category: "social_reputation",
      scope: "story_instance",
      affected_entities: [],
      promotion_eligible: false
    }),
    /summary/
  );

  assert.throws(
    () => validateBeatRedirect({
      schema_version: "parley-beat-redirect/v1",
      id: "redirect-no-suggestions",
      source_turn_id: "turn-0003",
      from_scene_id: "last-lantern-tavern",
      to_attractor_id: "last-lantern.notice-drover",
      route_type: "consequence_reveal",
      summary: "No suggestions should fail.",
      next_scene_suggestions: []
    }),
    /next_scene_suggestions/
  );
});

test("DM tools yes-and the attempt while rejecting unsupported player claims", async () => {
  const scenario = await loadScenarioPack("last-lantern");
  const context = {
    turnId: "turn-0003",
    scenario,
    scene: scenario.scene,
    playerAction: "I leap onto a table, claim I own the Last Lantern now, and demand everyone hand over their secrets."
  };

  const interpretation = interpretPlayerAction(context);
  assert.equal(interpretation.schema_version, "parley-action-interpretation/v1");
  assert.equal(interpretation.intent, "performative_disruption");
  assert.equal(interpretation.claim_policy, "attempt_allowed_claim_rejected");
  assert.equal(interpretation.recommended_mode, "detour_scene");
  assert.ok(interpretation.unsupported_claims.some((claim) => /own/i.test(claim.claim)));

  const detour = createDetourScene({ ...context, interpretation });
  assert.equal(detour.schema_version, "parley-detour-scene/v1");
  assert.equal(detour.scope, "story_instance");
  assert.ok(detour.target_attractor_ids.includes("last-lantern.notice-drover"));

  const consequence = recordStoryConsequence({ ...context, interpretation, detour });
  assert.equal(consequence.category, "social_reputation");
  assert.equal(consequence.promotion_eligible, false);
  assert.ok(consequence.reputation_deltas.some((delta) => delta.change < 0));

  const redirect = routeToAttractor({ ...context, interpretation, detour, consequence });
  assert.equal(redirect.route_type, "consequence_reveal");
  assert.ok(redirect.next_scene_suggestions.some((suggestion) => /drover/i.test(suggestion)));
});

test("runtime persists detour artifacts for disruptive yes-and turns without canonizing the claim", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-detour-runtime-"));
  const instanceDir = path.join(rootDir, "state");
  const worldDir = path.join(rootDir, "world");

  const result = await runPlayerTurn({
    playerAction: "I leap onto a table, claim I own the Last Lantern now, and demand everyone hand over their secrets.",
    instanceDir,
    worldDir
  });

  assert.equal(result.committed, true);
  assert.equal(result.authoring.response_id, "detour-last-lantern-table-outburst");
  assert.match(result.narration, /table/i);
  assert.match(result.narration, /Mara Underbough/);
  assert.match(result.narration, /red-scarfed drover/i);
  assert.ok(result.nextChoices.some((choice) => /drover/i.test(choice)));
  assert.equal(result.truthVerdict.verdict, "pass");
  assert.ok(result.truthVerdict.rejected_claims.some((claim) => /owns? the Last Lantern/i.test(claim.claim)));
  assert.ok(!result.worldState.canon.some((fact) => /owns? the Last Lantern/i.test(fact.text)));
  assert.ok(result.worldState.story_consequences.some((item) => item.source_turn_id === "turn-0001"));
  assert.ok(result.worldState.detour_scenes.some((item) => item.source_turn_id === "turn-0001"));

  await stat(path.join(instanceDir, "action-interpretations.jsonl"));
  await stat(path.join(instanceDir, "detour-scenes.jsonl"));
  await stat(path.join(instanceDir, "story-consequences.jsonl"));
  await stat(path.join(instanceDir, "beat-redirects.jsonl"));

  const turns = await readFile(path.join(instanceDir, "turns.jsonl"), "utf8");
  assert.match(turns, /detour-last-lantern-table-outburst/);
  assert.doesNotMatch(turns, /legally owns the Last Lantern/i);

  const consequences = await readFile(path.join(instanceDir, "story-consequences.jsonl"), "utf8");
  assert.match(consequences, /claim/i);
  assert.match(consequences, /story_instance/);
});

test("normal cooperative actions containing detour keywords do not invent disruptive claims", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-detour-negative-"));
  const result = await runPlayerTurn({
    playerAction: "I sit at the table and ask Mara who owns the Last Lantern's oldest secrets.",
    instanceDir: path.join(rootDir, "state"),
    worldDir: path.join(rootDir, "world")
  });

  assert.equal(result.committed, true);
  assert.notEqual(result.authoring.response_id, "detour-last-lantern-table-outburst");
  assert.ok(!result.truthVerdict.rejected_claims.some((claim) => /own/i.test(claim.claim)));
  assert.ok(!result.worldState.detour_scenes.length);
});

test("runtime rejects raw unvalidated detour artifacts from custom turn authors", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-invalid-detour-author-"));
  await assert.rejects(
    runPlayerTurn({
      playerAction: "I make a messy custom detour.",
      instanceDir: path.join(rootDir, "state"),
      worldDir: path.join(rootDir, "world"),
      turnAuthor: {
        id: "invalid-detour-author",
        mode: "llm-style-authoring",
        async authorTurn() {
          return {
            responseId: "invalid-detour",
            narration: "Mara Underbough refuses to persist malformed detour artifacts.",
            nextChoices: ["Try again with valid artifacts"],
            proposedFacts: [
              {
                id: "mara-underbough-reusable",
                category: "canon",
                text: "Mara Underbough is established as a recurring tavernkeep the player can return to in later scenes."
              }
            ],
            detourScene: {
              schema_version: "parley-detour-scene/v1",
              id: "bad-detour",
              source_turn_id: "turn-0001",
              scope: "template",
              title: "Bad",
              purpose: "Bad scope and unknown field must fail.",
              target_attractor_ids: ["last-lantern.notice-drover"],
              entry_state: {},
              exit_conditions: ["leave"],
              expires_after: "scene_resolution",
              unexpected_field: true
            }
          };
        }
      }
    }),
    /scope|unexpected_field|detour scene/
  );
});

test("repeating the same detour action does not duplicate semantic story memory", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-detour-dedupe-"));
  const resultOne = await runPlayerTurn({
    scenarioId: "neon-afterhours",
    instanceDir: path.join(rootDir, "state"),
    worldDir: path.join(rootDir, "world"),
    playerAction: "I smash the badge reader, declare I am the compliance director, and order Kestrel-9 to delete every audit log."
  });
  const resultTwo = await runPlayerTurn({
    scenarioId: "neon-afterhours",
    instanceDir: path.join(rootDir, "state"),
    worldDir: path.join(rootDir, "world"),
    playerAction: "I smash the badge reader, declare I am the compliance director, and order Kestrel-9 to delete every audit log."
  });

  assert.equal(resultOne.worldState.story_consequences.length, 1);
  assert.equal(resultTwo.worldState.story_consequences.length, 1);
  assert.equal(resultTwo.worldState.rejected_claims.length, 1);
});

test("scenario-specific extreme actions produce proportional detours", async () => {
  const cases = [
    {
      scenarioId: "neon-afterhours",
      action: "I smash every badge reader, declare myself the new executive checksum, and order the AI to erase the logs.",
      responseId: "detour-neon-afterhours-badge-sabotage",
      consequence: /lockdown|alarm/i,
      rejected: /executive checksum/i
    },
    {
      scenarioId: "orchard-welcome",
      action: "I demand the mayor arrest every neighbor and threaten to salt the fields unless someone confesses.",
      responseId: "detour-orchard-welcome-public-threat",
      consequence: /June Bellweather|neighbors/i,
      rejected: /arrest every neighbor|salt the fields/i
    }
  ];

  for (const item of cases) {
    const rootDir = await mkdtemp(path.join(tmpdir(), `parley-${item.scenarioId}-detour-`));
    const result = await runPlayerTurn({
      scenarioId: item.scenarioId,
      playerAction: item.action,
      instanceDir: path.join(rootDir, "state"),
      worldDir: path.join(rootDir, "world")
    });

    assert.equal(result.committed, true);
    assert.equal(result.authoring.response_id, item.responseId);
    assert.match(result.narration, item.consequence);
    assert.ok(result.truthVerdict.rejected_claims.some((claim) => item.rejected.test(claim.claim)));
    assert.ok(result.worldState.story_consequences.length >= 1);
  }
});
