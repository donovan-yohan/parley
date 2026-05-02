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
