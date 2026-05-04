import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadWorldManifest, loadWorldBundle, WorldLoadError } from "../src/worlds-loader/index.ts";

// ─── fetch mock setup ─────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(handler) {
  globalThis.fetch = async (url, ...args) => {
    return handler(url, ...args);
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function makeJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeErrorResponse(status) {
  return {
    ok: false,
    status,
    json: async () => ({ error: `HTTP ${status}` }),
    text: async () => JSON.stringify({ error: `HTTP ${status}` }),
  };
}

const VALID_MANIFEST = {
  schema_version: "parley-world-manifest/v1",
  worlds: {
    "last-lantern": { shell: "default", entryUrl: null },
    "neon-afterhours": { shell: "default", entryUrl: null },
  },
};

// ─── loadWorldManifest — happy path ──────────────────────────────────────────

describe("loadWorldManifest — happy path", () => {
  before(() => {
    mockFetch((_url) => makeJsonResponse(VALID_MANIFEST));
  });

  after(restoreFetch);

  test("returns a validated WorldManifest", async () => {
    const manifest = await loadWorldManifest();
    assert.equal(manifest.schema_version, "parley-world-manifest/v1");
    assert.ok(manifest.worlds["last-lantern"]);
    assert.equal(manifest.worlds["last-lantern"].shell, "default");
    assert.equal(manifest.worlds["last-lantern"].entryUrl, null);
  });

  test("manifest has worlds record", async () => {
    const manifest = await loadWorldManifest();
    assert.ok(typeof manifest.worlds === "object");
  });
});

// ─── loadWorldManifest — 404 error ───────────────────────────────────────────

describe("loadWorldManifest — 404 HTTP error", () => {
  before(() => {
    mockFetch((_url) => makeErrorResponse(404));
  });

  after(restoreFetch);

  test("throws WorldLoadError on 404", async () => {
    await assert.rejects(
      () => loadWorldManifest(),
      (err) => {
        assert.ok(err instanceof WorldLoadError, `Expected WorldLoadError, got ${err.constructor.name}`);
        assert.ok(err.message.includes("404"), `Expected 404 in message: ${err.message}`);
        return true;
      }
    );
  });
});

// ─── loadWorldManifest — network error ────────────────────────────────────────

describe("loadWorldManifest — network error", () => {
  before(() => {
    mockFetch(() => { throw new Error("ECONNREFUSED"); });
  });

  after(restoreFetch);

  test("throws WorldLoadError on network failure", async () => {
    await assert.rejects(
      () => loadWorldManifest(),
      (err) => {
        assert.ok(err instanceof WorldLoadError);
        assert.ok(err.message.includes("Network error") || err.cause?.message === "ECONNREFUSED");
        return true;
      }
    );
  });
});

// ─── loadWorldManifest — schema validation failure ────────────────────────────

describe("loadWorldManifest — invalid schema", () => {
  before(() => {
    mockFetch((_url) =>
      makeJsonResponse({ schema_version: "wrong/v1", worlds: {} })
    );
  });

  after(restoreFetch);

  test("throws WorldLoadError on schema validation failure", async () => {
    await assert.rejects(
      () => loadWorldManifest(),
      (err) => {
        assert.ok(err instanceof WorldLoadError);
        assert.ok(
          err.message.includes("validation") || err.worldId === "(manifest)",
          `Unexpected message: ${err.message}`
        );
        return true;
      }
    );
  });
});

// ─── loadWorldBundle — theme-only (null entryUrl) ─────────────────────────────

describe("loadWorldBundle — theme-only world (entryUrl: null)", () => {
  test("resolves successfully without fetching anything", async () => {
    // No fetch mock needed — null entryUrl is a no-op
    const entry = { shell: "default", entryUrl: null };
    await assert.doesNotReject(() => loadWorldBundle("last-lantern", entry));
  });
});

// ─── loadWorldBundle — eval/import error ──────────────────────────────────────

describe("loadWorldBundle — dynamic import failure", () => {
  test("throws WorldLoadError when dynamic import fails", async () => {
    // Non-null entryUrl pointing to a non-existent module
    const entry = { shell: "default", entryUrl: "/dist/worlds/nonexistent/entry.js" };

    await assert.rejects(
      () => loadWorldBundle("nonexistent", entry),
      (err) => {
        assert.ok(
          err instanceof WorldLoadError,
          `Expected WorldLoadError, got ${err.constructor.name}: ${err.message}`
        );
        assert.equal(err.worldId, "nonexistent");
        return true;
      }
    );
  });
});

// ─── loadWorldBundle — integrity mismatch ─────────────────────────────────────

describe("loadWorldBundle — integrity mismatch", () => {
  // We mock fetch to return some bytes, then the integrity hash won't match.
  before(() => {
    mockFetch((_url) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode("fake bundle content").buffer,
    }));
  });

  after(restoreFetch);

  test("throws WorldLoadError on integrity mismatch", async () => {
    const entry = {
      shell: "default",
      entryUrl: "/dist/worlds/test/entry.js",
      integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    };

    await assert.rejects(
      () => loadWorldBundle("test-world", entry),
      (err) => {
        assert.ok(err instanceof WorldLoadError);
        assert.ok(
          err.message.includes("Integrity mismatch") || err.message.includes("integrity"),
          `Unexpected message: ${err.message}`
        );
        return true;
      }
    );
  });
});

// ─── loadWorldBundle — unsupported integrity algorithm ────────────────────────

describe("loadWorldBundle — unsupported integrity algorithm", () => {
  before(() => {
    mockFetch((_url) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
  });

  after(restoreFetch);

  test("throws WorldLoadError for non-sha384 integrity", async () => {
    const entry = {
      shell: "default",
      entryUrl: "/dist/worlds/test/entry.js",
      integrity: "sha256-abc123",
    };

    await assert.rejects(
      () => loadWorldBundle("test-world", entry),
      (err) => {
        assert.ok(err instanceof WorldLoadError);
        assert.ok(err.message.includes("sha384"), `Unexpected: ${err.message}`);
        return true;
      }
    );
  });
});

// ─── WorldLoadError — structure ───────────────────────────────────────────────

describe("WorldLoadError — structure", () => {
  test("has name, worldId, and cause", () => {
    const cause = new Error("root cause");
    const err = new WorldLoadError("my-world", "Something went wrong", cause);
    assert.equal(err.name, "WorldLoadError");
    assert.equal(err.worldId, "my-world");
    assert.equal(err.message, "Something went wrong");
    assert.strictEqual(err.cause, cause);
  });

  test("is instanceof Error", () => {
    const err = new WorldLoadError("w", "msg");
    assert.ok(err instanceof Error);
  });

  test("works without cause", () => {
    const err = new WorldLoadError("w", "no cause here");
    assert.equal(err.cause, undefined);
  });
});
