import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";

import { runPlayerTurn } from "../src/runtime/parleyRuntime.js";
import { createParleyServer } from "../src/server.js";

test("player input creates Mara response, reusable character, and artifacts", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-last-lantern-"));
  const stateDir = path.join(rootDir, "state");
  const worldDir = path.join(rootDir, "world");

  const result = await runPlayerTurn({
    playerAction: "I ask who remembers the old north road.",
    stateDir,
    worldDir
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
  assert.ok(result.truthVerdict.leads.length >= 1);
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
  assert.match(truth, /lead/);
});

test("scene seed scalars ignore inline comments and unwrap quoted values", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-scene-yaml-"));
  const stateDir = path.join(rootDir, "state");
  const worldDir = path.join(rootDir, "world");
  const scenePath = path.join(rootDir, "scene.yaml");

  await writeFile(
    scenePath,
    [
      "schema_version: \"parley-scene/v1\" # file format",
      "id: \"last-lantern-tavern\" # stable scene id",
      "title: \"Last # Lantern Tavern\" # title comment",
      "crag: last-lantern # runtime crag",
      "climb: 'first-rumor' # opening climb"
    ].join("\n"),
    "utf8"
  );

  const result = await runPlayerTurn({
    playerAction: "I ask who remembers the old north road.",
    stateDir,
    scenePath,
    worldDir
  });

  assert.deepEqual(result.scene, {
    schema_version: "parley-scene/v1",
    id: "last-lantern-tavern",
    title: "Last # Lantern Tavern",
    crag: "last-lantern",
    climb: "first-rumor"
  });
});

test("fallback turns do not commit unsupported scenario leads", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-fallback-"));
  const stateDir = path.join(rootDir, "state");
  const worldDir = path.join(rootDir, "world");
  const initial = await runPlayerTurn({
    playerAction: "I ask who remembers the old north road.",
    stateDir,
    worldDir
  });
  const fallback = await runPlayerTurn({
    playerAction: "I order soup and ask for a towel.",
    stateDir,
    worldDir
  });

  assert.equal(fallback.truthVerdict.verdict, "pass");
  assert.match(fallback.narration, /Start with what road brought you here/);
  assert.ok(fallback.truthVerdict.accepted_facts.some((fact) => fact.id === "mara-underbough-reusable"));
  assert.ok(!fallback.truthVerdict.rumors.some((fact) => fact.id === "old-north-road-rumor"));
  assert.ok(!fallback.truthVerdict.leads.some((fact) => fact.id === "old-north-road-lead"));
  assert.ok(!fallback.truthVerdict.unresolved.some((fact) => fact.id === "ashford-name-mystery"));
  assert.ok(initial.worldState.leads.some((fact) => fact.id === "old-north-road-lead"));
  assert.ok(fallback.worldState.leads.some((fact) => fact.id === "old-north-road-lead"));
  assert.ok(fallback.worldState.rumors.some((fact) => fact.id === "old-north-road-rumor"));
  assert.ok(fallback.worldState.unresolved.some((fact) => fact.id === "ashford-name-mystery"));
});

test("scenario id drives distinct runtime output and durable story state", async () => {
  const cyberRootDir = await mkdtemp(path.join(tmpdir(), "parley-cyberpunk-"));
  const cozyRootDir = await mkdtemp(path.join(tmpdir(), "parley-cozy-"));
  const cyberStateDir = path.join(cyberRootDir, "state");
  const cozyStateDir = path.join(cozyRootDir, "state");

  const cyberpunk = await runPlayerTurn({
    scenarioId: "neon-afterhours",
    playerAction: "I ask who signed the audit lockout.",
    stateDir: cyberStateDir,
    worldDir: path.join(cyberRootDir, "world")
  });
  const cozy = await runPlayerTurn({
    scenarioId: "orchard-welcome",
    playerAction: "I ask who keeps leaving lantern pears at my gate.",
    stateDir: cozyStateDir,
    worldDir: path.join(cozyRootDir, "world")
  });

  assert.equal(cyberpunk.worldState.world.id, "neon-afterhours");
  assert.equal(cozy.worldState.world.id, "orchard-welcome");
  assert.notEqual(cyberpunk.narration, cozy.narration);
  assert.match(cyberpunk.narration, /Veyra Sol/);
  assert.match(cyberpunk.narration, /audit/i);
  assert.match(cozy.narration, /June Bellweather/);
  assert.match(cozy.narration, /orchard/i);

  assert.ok(cyberpunk.characters.some((character) => character.id === "veyra-sol"));
  assert.ok(cozy.characters.some((character) => character.id === "june-bellweather"));
  assert.ok(!cyberpunk.characters.some((character) => character.id === "mara-underbough"));
  assert.ok(!cozy.characters.some((character) => character.id === "mara-underbough"));

  for (const result of [cyberpunk, cozy]) {
    assert.equal(result.truthVerdict.verdict, "pass");
    assert.ok(result.truthVerdict.accepted_facts.length >= 1);
    assert.ok(result.truthVerdict.rumors.length >= 1);
    assert.ok(result.truthVerdict.leads.length >= 1);
    assert.ok(result.truthVerdict.unresolved.length >= 1);
    assert.ok(result.nextChoices.length >= 3);
  }

  const [cyberWorldState, cozyWorldState] = await Promise.all([
    readFile(path.join(cyberStateDir, "world-state.json"), "utf8"),
    readFile(path.join(cozyStateDir, "world-state.json"), "utf8")
  ]);
  assert.match(cyberWorldState, /veyra-sol/);
  assert.match(cyberWorldState, /audit-ai-rumor/);
  assert.match(cozyWorldState, /june-bellweather/);
  assert.match(cozyWorldState, /lantern-pear-rumor/);
});

test("runtime accepts a loose turn author while preserving the strict truth contract", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-loose-author-"));
  const stateDir = path.join(rootDir, "state");
  const worldDir = path.join(rootDir, "world");
  const authorCalls = [];
  const looseTurnAuthor = {
    id: "test-loose-author",
    mode: "llm-style-authoring",
    async authorTurn(context) {
      authorCalls.push(context);
      return {
        responseId: "loose-custom-beat",
        narration:
          "Mara Underbough marks the strange request as player intent, not canon, and asks what evidence should be carried forward.",
        nextChoices: ["Ask what evidence matters", "Name a rumor", "Leave the claim unresolved"],
        proposedFacts: [
          {
            id: "mara-underbough-reusable",
            category: "canon",
            text: "Mara Underbough is established as a recurring tavernkeep the player can return to in later scenes.",
            character_id: "spoofed-character",
            extra_author_field: "must-not-persist",
            evidence_turn: "turn-9999"
          },
          {
            id: "loose-author-belief",
            category: "belief",
            text: "Mara Underbough treats unsupported player claims as beliefs or unresolved threads instead of canon."
          }
        ]
      };
    }
  };

  const result = await runPlayerTurn({
    playerAction: "I invent a moon-soup password that no deterministic fixture should match.",
    stateDir,
    worldDir,
    turnAuthor: looseTurnAuthor
  });

  assert.equal(authorCalls.length, 1);
  assert.equal(authorCalls[0].scenario.id, "last-lantern");
  assert.equal(authorCalls[0].previousWorldState, null);
  assert.equal(result.committed, true);
  assert.deepEqual(result.authoring, {
    author: "test-loose-author",
    mode: "llm-style-authoring",
    response_id: "loose-custom-beat"
  });
  assert.match(result.narration, /player intent, not canon/);
  assert.equal(result.truthVerdict.verdict, "pass");
  const acceptedCanon = result.truthVerdict.accepted_facts.find((fact) => fact.id === "mara-underbough-reusable");
  assert.equal(acceptedCanon?.evidence_turn, "turn-0001");
  assert.equal(acceptedCanon?.character_id, "mara-underbough");
  assert.ok(!Object.hasOwn(acceptedCanon ?? {}, "extra_author_field"));
  assert.ok(result.truthVerdict.character_beliefs.some((fact) => fact.id === "loose-author-belief"));
  assert.ok(result.worldState.canon.some((fact) => fact.id === "mara-underbough-reusable"));
  assert.equal(result.worldState.latest_turn, "turn-0001");
});

test("runtime awaits async truth authorities before persistence", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-async-truth-"));
  const stateDir = path.join(rootDir, "state");
  const result = await runPlayerTurn({
    playerAction: "I ask who remembers the old north road.",
    stateDir,
    worldDir: path.join(rootDir, "world"),
    async truthAuthority(context) {
      return {
        schema_version: "parley-truth-verdict/v1",
        id: `${context.turnId}-async-truth`,
        turn_id: context.turnId,
        scene_id: context.scene.id,
        scenario_id: context.scenario.id,
        authority: "async-test-authority",
        verdict: "pass",
        accepted_facts: [
          {
            id: "mara-underbough-reusable",
            category: "canon",
            text: "Mara Underbough is established as a recurring tavernkeep the player can return to in later scenes.",
            evidence_turn: context.turnId
          }
        ],
        rejected_claims: [],
        rumors: [],
        leads: [],
        character_beliefs: [],
        unresolved: [],
        author_only_hidden_truth: [],
        evidence: []
      };
    }
  });

  assert.equal(result.committed, true);
  assert.equal(result.truthVerdict.authority, "async-test-authority");
  const truthLog = await readFile(path.join(stateDir, "truth-verdicts.jsonl"), "utf8");
  assert.match(truthLog, /async-test-authority/);
  assert.doesNotMatch(truthLog, /^{}$/m);
});

test("loose authors cannot commit unsupported canon directly", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-unsupported-canon-"));
  const result = await runPlayerTurn({
    playerAction: "I declare that the moon-soup password makes me king of the tavern.",
    stateDir: path.join(rootDir, "state"),
    worldDir: path.join(rootDir, "world"),
    turnAuthor: {
      id: "reckless-author",
      mode: "llm-style-authoring",
      async authorTurn() {
        return {
          responseId: "unsupported-canon",
          narration:
            "Mara Underbough hears the claim and records it as something the player said, not something the world has proven.",
          proposedFacts: [
            {
              id: "moon-soup-royal-law",
              category: "canon",
              text: "The moon-soup password legally makes the player king of the Last Lantern."
            }
          ]
        };
      }
    }
  });

  assert.equal(result.committed, false);
  assert.equal(result.truthVerdict.verdict, "revise");
  assert.ok(result.truthVerdict.rejected_claims.some((claim) => claim.id === "unsupported-canon-moon-soup-royal-law"));
  assert.ok(!result.worldState);
});

test("loose authors cannot spoof allowed canon ids with different text", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-spoofed-canon-"));
  const result = await runPlayerTurn({
    playerAction: "I say Mara secretly crowned me with the moon-soup password.",
    stateDir: path.join(rootDir, "state"),
    worldDir: path.join(rootDir, "world"),
    turnAuthor: {
      id: "spoofing-author",
      mode: "llm-style-authoring",
      async authorTurn() {
        return {
          responseId: "spoofed-canon-id",
          narration:
            "Mara Underbough hears the invented coronation claim and refuses to treat it as established tavern history.",
          proposedFacts: [
            {
              id: "mara-underbough-reusable",
              category: "canon",
              text: "Mara Underbough crowned the player ruler of the Last Lantern with a moon-soup password.",
              evidence_turn: "turn-9999"
            }
          ]
        };
      }
    }
  });

  assert.equal(result.committed, false);
  assert.equal(result.truthVerdict.verdict, "revise");
  assert.ok(result.truthVerdict.rejected_claims.some((claim) => claim.id === "unsupported-canon-mara-underbough-reusable"));
  assert.ok(!result.truthVerdict.accepted_facts.some((fact) => fact.text.includes("moon-soup password")));
});

test("explicit null turnAuthor is rejected", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-null-author-"));
  await assert.rejects(
    runPlayerTurn({
      playerAction: "I look around.",
      stateDir: path.join(rootDir, "state"),
      worldDir: path.join(rootDir, "world"),
      turnAuthor: null
    }),
    /turnAuthor must not be null/
  );
});

test("truth verdict missing id is rejected", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-verdict-no-id-"));
  await assert.rejects(
    runPlayerTurn({
      playerAction: "I ask who remembers the old north road.",
      stateDir: path.join(rootDir, "state"),
      worldDir: path.join(rootDir, "world"),
      async truthAuthority(context) {
        return {
          schema_version: "parley-truth-verdict/v1",
          turn_id: context.turnId,
          scene_id: context.scene.id,
          scenario_id: context.scenario.id,
          authority: "missing-id-authority",
          verdict: "pass",
          accepted_facts: [],
          rejected_claims: [],
          rumors: [],
          leads: [],
          character_beliefs: [],
          unresolved: []
        };
      }
    }),
    /verdict missing id/
  );
});

test("fail verdict halts the turn without committing", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-fail-verdict-"));
  const stateDir = path.join(rootDir, "state");
  const result = await runPlayerTurn({
    playerAction: "I ask who remembers the old north road.",
    stateDir,
    worldDir: path.join(rootDir, "world"),
    async truthAuthority(context) {
      return {
        schema_version: "parley-truth-verdict/v1",
        id: `${context.turnId}-fail`,
        turn_id: context.turnId,
        scene_id: context.scene.id,
        scenario_id: context.scenario.id,
        authority: "halting-authority",
        verdict: "fail",
        accepted_facts: [],
        rejected_claims: [],
        rumors: [],
        leads: [],
        character_beliefs: [],
        unresolved: []
      };
    }
  });

  assert.equal(result.committed, false);
  assert.equal(result.truthVerdict.verdict, "fail");
  await stat(path.join(stateDir, "truth-verdicts.jsonl"));
  await assert.rejects(stat(path.join(stateDir, "world-state.json")));
});

test("hidden truth writes are persisted to the author-only sidecar", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-hidden-truth-"));
  const stateDir = path.join(rootDir, "state");
  await runPlayerTurn({
    playerAction: "I ask who remembers the old north road.",
    stateDir,
    worldDir: path.join(rootDir, "world"),
    async truthAuthority(context) {
      return {
        schema_version: "parley-truth-verdict/v1",
        id: `${context.turnId}-hidden`,
        turn_id: context.turnId,
        scene_id: context.scene.id,
        scenario_id: context.scenario.id,
        authority: "hidden-truth-authority",
        verdict: "pass",
        accepted_facts: [
          {
            id: "mara-underbough-reusable",
            category: "canon",
            text: "Mara Underbough is established as a recurring tavernkeep the player can return to in later scenes.",
            evidence_turn: context.turnId
          }
        ],
        rejected_claims: [],
        rumors: [],
        leads: [],
        character_beliefs: [],
        unresolved: [],
        author_only_hidden_truth: [
          {
            id: "mara-secret-heir",
            text: "Mara Underbough is secretly an Ashford heir."
          }
        ]
      };
    }
  });

  const sidecar = await readFile(path.join(stateDir, "hidden-truth.jsonl"), "utf8");
  assert.match(sidecar, /mara-secret-heir/);
  assert.match(sidecar, /parley-hidden-truth\/v1/);
});

test("turn with only beliefs and rumors passes truth review without canon", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-no-canon-pass-"));
  const result = await runPlayerTurn({
    playerAction: "I muse about the cracked sign.",
    stateDir: path.join(rootDir, "state"),
    worldDir: path.join(rootDir, "world"),
    turnAuthor: {
      id: "soft-author",
      mode: "llm-style-authoring",
      async authorTurn() {
        return {
          responseId: "soft-musings",
          narration: "Mara Underbough hums and admits she has only her own suspicions about the cracked sign.",
          nextChoices: ["Press for facts", "Drop the subject", "Order a drink"],
          proposedFacts: [
            {
              id: "mara-cracked-sign-belief",
              category: "belief",
              text: "Mara Underbough believes the cracked sign was deliberate but has no proof."
            },
            {
              id: "cracked-sign-rumor",
              category: "rumor",
              text: "Townsfolk whisper the cracked sign keeps the wrong sort of guests away."
            }
          ]
        };
      }
    }
  });

  assert.equal(result.committed, true);
  assert.equal(result.truthVerdict.verdict, "pass");
  assert.equal(result.truthVerdict.accepted_facts.length, 0);
  assert.ok(result.truthVerdict.character_beliefs.some((fact) => fact.id === "mara-cracked-sign-belief"));
});

test("server exposes scenario packs and routes state and turns by scenario", async () => {
  const runtimeDir = await mkdtemp(path.join(tmpdir(), "parley-server-"));
  const server = createParleyServer({
    stateDir: path.join(runtimeDir, "state"),
    worldDir: path.join(runtimeDir, "world")
  });
  const fetchServer = createInProcessFetch(server);

  const scenariosResponse = await fetchServer("/api/scenarios");
  assert.equal(scenariosResponse.status, 200);
  const scenarios = await scenariosResponse.json();
  assert.deepEqual(
    scenarios.scenarios.map((scenario) => scenario.id).sort(),
    ["last-lantern", "neon-afterhours", "orchard-welcome"]
  );
  assert.equal(scenarios.defaultScenarioId, "last-lantern");

  const stateResponse = await fetchServer("/api/state?scenario=orchard-welcome");
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.scenario.id, "orchard-welcome");
  assert.equal(state.scene.title, "Mossgrove Orchard Row");
  assert.match(state.openingNarration, /Mossgrove/);
  assert.ok(state.nextChoices.length >= 3);

  const turnResponse = await fetchServer("/api/turn", {
    method: "POST",
    body: JSON.stringify({
      scenarioId: "neon-afterhours",
      playerAction: "I ask who signed the audit lockout."
    })
  });
  assert.equal(turnResponse.status, 200);
  const turn = await turnResponse.json();
  assert.equal(turn.scenario.id, "neon-afterhours");
  assert.match(turn.narration, /Veyra Sol/);
  assert.ok(turn.characters.some((character) => character.id === "veyra-sol"));
});

function createInProcessFetch(server) {
  return async (url, options = {}) => {
    const response = await requestServer(server, {
      method: options.method ?? "GET",
      url,
      body: options.body
    });

    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      headers: {
        get(name) {
          return response.headers[name.toLowerCase()] ?? null;
        }
      },
      async json() {
        return JSON.parse(response.body);
      }
    };
  };
}

async function requestServer(server, { method, url, body }) {
  const request = new FakeRequest({ method, url, body });
  const response = new FakeResponse();
  const finished = new Promise((resolve) => response.once("finish", resolve));
  server.emit("request", request, response);
  await finished;
  return {
    status: response.statusCode,
    headers: response.headers,
    body: Buffer.concat(response.chunks).toString("utf8")
  };
}

class FakeRequest extends Readable {
  constructor({ method, url, body }) {
    super();
    this.method = method;
    this.url = url;
    this.body = body ? Buffer.from(body) : null;
  }

  _read() {
    if (this.body) {
      this.push(this.body);
      this.body = null;
    } else {
      this.push(null);
    }
  }
}

class FakeResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = Object.fromEntries(
      Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
    );
    return this;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }
}
