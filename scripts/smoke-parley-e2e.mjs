#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable, Writable } from "node:stream";

import { createParleyServer } from "../src/server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let stateDir;
let worldDir;
const playerAction = "I ask who remembers the old north road.";
const originalFetch = globalThis.fetch;

async function main() {
  const runtimeDir = await mkdtemp(path.join(tmpdir(), "parley-e2e-"));
  stateDir = path.join(runtimeDir, "state");
  worldDir = path.join(runtimeDir, "world");
  await mkdir(stateDir, { recursive: true });
  await Promise.all([
    rm(path.join(stateDir, "world-state.json"), { force: true }),
    rm(path.join(stateDir, "turns.jsonl"), { force: true }),
    rm(path.join(stateDir, "truth-verdicts.jsonl"), { force: true })
  ]);

  const server = createParleyServer({ stateDir, worldDir });
  const serverFetch = createInProcessFetch(server);

  try {
    const [html, appSource, cssSource] = await Promise.all([
      fetchText(serverFetch, "/", "text/html"),
      fetchText(serverFetch, "/app.js", "text/javascript"),
      fetchText(serverFetch, "/styles.css", "text/css")
    ]);

    assert.match(html, /id="theme-select"/);
    assert.match(appSource, /scenarioSelect\.addEventListener/);
    assert.match(appSource, /\/api\/scenarios/);
    assert.match(cssSource, /\[data-theme="last-lantern"\]/);
    assert.match(cssSource, /\[data-theme="cyberpunk"\]/);
    assert.match(cssSource, /\[data-theme="cozy"\]/);

    const harness = createDomHarness();
    installClientGlobals({ harness, serverFetch });

    const appUrl = pathToFileURL(path.join(root, "src", "client", "app.js"));
    appUrl.search = `smoke=${Date.now()}`;
    await import(appUrl.href);

    await waitUntil(() => harness.themeSelect.value === "last-lantern");
    assert.deepEqual(
      harness.themeSelect.children.map((option) => option.value).sort(),
      ["last-lantern", "neon-afterhours", "orchard-welcome"]
    );
    assert.equal(harness.sceneTitle.textContent, "Last Lantern Tavern");
    assert.match(textContent(harness.transcript), /old north road waits in the rain/);

    harness.themeSelect.value = "neon-afterhours";
    await harness.themeSelect.dispatchEvent({ type: "change" });
    assert.equal(harness.document.documentElement.dataset.theme, "cyberpunk");
    assert.equal(harness.sceneTitle.textContent, "After-Hours Audit Floor");
    assert.match(harness.sceneSubtitle.textContent, /sealed audit floor/);
    assert.equal(harness.input.value, "I ask who signed the audit lockout.");
    assert.match(textContent(harness.transcript), /Helix Arcology/);

    harness.themeSelect.value = "last-lantern";
    await harness.themeSelect.dispatchEvent({ type: "change" });
    assert.equal(harness.document.documentElement.dataset.theme, "last-lantern");
    assert.equal(harness.sceneTitle.textContent, "Last Lantern Tavern");

    harness.input.value = playerAction;

    let releaseTurnFetch;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (url === "/api/turn") {
        return new Promise((resolve, reject) => {
          releaseTurnFetch = () => {
            realFetch("/api/turn", options).then(resolve, reject);
          };
        });
      }
      return realFetch(url, options);
    };

    const submitPromise = harness.form.dispatchEvent({ type: "submit", preventDefault() {} });
    assert.equal(harness.input.disabled, true);
    assert.equal(harness.submitButton.disabled, true);
    assert.equal(harness.submitButton.textContent, "Listening...");
    assert.equal(harness.turnStatus.textContent, "The room weighs the question before answering.");

    assert.ok(releaseTurnFetch, "client submit should call /api/turn");
    releaseTurnFetch();
    await submitPromise;

    assert.equal(harness.input.disabled, false);
    assert.equal(harness.submitButton.disabled, false);
    assert.equal(harness.submitButton.textContent, "Submit");
    assert.equal(harness.turnStatus.textContent, "");
    assert.match(textContent(harness.transcript), /Mara Underbough/);
    assert.match(textContent(harness.transcript), /old north road/i);
    assert.match(textContent(harness.transcript), /Ashford/i);
    assert.match(textContent(harness.transcript), /lead|thread|trail/i);
    assert.match(textContent(harness.characters), /Mara Underbough/);
    assert.match(textContent(harness.characters), /reusable, resumable NPC/);
    assert.doesNotMatch(textContent(harness.characters), /keeps the Last Lantern's bar/);
    assert.match(textContent(harness.truth), /Leads/);
    assert.match(textContent(harness.truth), /Rumors/);
    assert.match(textContent(harness.truth), /Unresolved/);

    globalThis.fetch = async (url, options) => {
      if (url === "/api/turn") {
        return {
          status: 500,
          ok: false,
          async json() {
            return { error: "Synthetic turn failure." };
          }
        };
      }
      return realFetch(url, options);
    };
    harness.input.value = "Ask a question that fails in the smoke harness.";
    await harness.form.dispatchEvent({ type: "submit", preventDefault() {} });
    assert.match(textContent(harness.transcript), /Synthetic turn failure/);
    assert.match(textContent(harness.characters), /Mara Underbough/);
    assert.match(textContent(harness.truth), /Leads/);

    const choiceButton = harness.choices.children[0].children[0];
    choiceButton.dispatchEvent({ type: "click" });
    assert.equal(harness.input.value, choiceButton.textContent);

    const worldStatePath = path.join(stateDir, "world-state.json");
    const turnsPath = path.join(stateDir, "turns.jsonl");
    const truthPath = path.join(stateDir, "truth-verdicts.jsonl");

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

    console.log("Parley narrative e2e smoke");
    console.log("");
    console.log("Checks:");
    for (const check of [
      "Server served index, client JavaScript, and theme CSS",
      "Client scenario selector is populated from /api/scenarios",
      "Client scenario selection updates theme, title, subtitle, opening line, and input default",
      "Client submit enters and exits loading state",
      "Client submit exercises /api/turn",
      "Client keeps the last good state after a failed turn",
      "Mara answers the old north road prompt",
      "Mara is reusable and resumable",
      "Story memory records rumor, lead, and unresolved mystery",
      "Choice buttons populate the next input",
      "State artifacts were persisted"
    ]) {
      console.log(`- ${check}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function fetchText(fetchImpl, url, expectedContentType) {
  const response = await fetchImpl(url);
  assert.equal(response.status, 200, `${url} should return 200`);
  assert.match(response.headers.get("content-type") ?? "", new RegExp(expectedContentType));
  return response.text();
}

function installClientGlobals({ harness, serverFetch }) {
  globalThis.document = harness.document;
  globalThis.fetch = serverFetch;
}

function createInProcessFetch(server) {
  return async (url, options = {}) => {
    const requestUrl = String(url).startsWith("http")
      ? `${new URL(url).pathname}${new URL(url).search}`
      : String(url);
    const response = await requestServer(server, {
      method: options.method ?? "GET",
      url: requestUrl,
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
      async text() {
        return response.body;
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

function createDomHarness() {
  const document = new FakeDocument();
  const elements = {
    form: document.register("turn-form", new FakeElement("form")),
    input: document.register("player-action", new FakeElement("input")),
    submitButton: document.register("submit-turn", new FakeElement("button")),
    turnStatus: document.register("turn-status", new FakeElement("p")),
    transcript: document.register("transcript", new FakeElement("ol")),
    choices: document.register("choices", new FakeElement("ul")),
    characters: document.register("characters", new FakeElement("ul")),
    truth: document.register("truth", new FakeElement("div")),
    themeSelect: document.register("theme-select", new FakeElement("select")),
    sceneTitle: document.register("scene-title", new FakeElement("h1")),
    sceneSubtitle: document.register("scene-subtitle", new FakeElement("p"))
  };
  elements.input.focus = () => {};
  elements.input.select = () => {};
  return { document, ...elements };
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement("html");
    this.documentElement.dataset = {};
    this.elements = new Map();
    this.title = "";
  }

  register(id, element) {
    element.id = id;
    this.elements.set(id, element);
    return element;
  }

  querySelector(selector) {
    if (!selector.startsWith("#")) {
      throw new Error(`Unsupported selector in smoke DOM: ${selector}`);
    }
    const element = this.elements.get(selector.slice(1));
    assert.ok(element, `expected smoke DOM element ${selector}`);
    return element;
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.eventListeners = new Map();
    this.className = "";
    this.disabled = false;
    this.value = "";
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(type, listener) {
    const listeners = this.eventListeners.get(type) ?? [];
    listeners.push(listener);
    this.eventListeners.set(type, listeners);
  }

  async dispatchEvent(event) {
    const listeners = this.eventListeners.get(event.type) ?? [];
    await Promise.all(listeners.map((listener) => listener(event)));
  }

  focus() {}

  select() {}
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

await main();

function textContent(element) {
  return [element.textContent, ...element.children.map((child) => textContent(child))].join(" ");
}

async function waitUntil(predicate, timeoutMs = 500) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for smoke condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
