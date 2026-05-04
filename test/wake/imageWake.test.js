/**
 * imageWake.test.js
 *
 * Unit tests for src/runtime/wake/imageWake.js
 * All external effects (wakeNpc, fs) use real fs with mkdtemp sandboxes.
 *
 * Run via: node --test test/wake/imageWake.test.js
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { dispatchImageWake } from "../../src/runtime/wake/imageWake.js";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Create a temp instance dir with a manifest.json.
 */
async function makeInstanceDir({ cragSlug = "test-crag" } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "parley-image-wake-test-"));
  const manifest = {
    schema_version: "parley-instance-manifest/v1",
    world_id: "last-lantern",
    instance_id: cragSlug,
    crag_slug: cragSlug,
    created_at: new Date().toISOString(),
  };
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  return dir;
}

/**
 * Create a temp world dir with an assets/ directory.
 * Returns { worldDir }.
 */
async function makeWorldDir() {
  const worldDir = await mkdtemp(path.join(tmpdir(), "parley-world-test-"));
  await mkdir(path.join(worldDir, "assets"), { recursive: true });
  return worldDir;
}

/**
 * Base args for dispatchImageWake — overrideable.
 */
function makeBaseArgs(overrides = {}) {
  return {
    instanceDir: overrides.instanceDir ?? "/tmp/placeholder-instance",
    worldDir: overrides.worldDir ?? "/tmp/placeholder-world",
    talentName: "background-artist",
    prompt: "A misty mountain valley at dawn",
    aspectRatio: "landscape",
    outputTarget: { kind: "background", id: "mountain-valley" },
    storyId: "story-001",
    cragSlug: "test-crag",
    sceneId: "tavern-scene",
    currentTurnId: "turn-0001",
    wakeNpcFn: async () => ({}), // replaced in each test
    validateImageWake: null,
    validateImageWakeResult: null,
    appendStoryEventFn: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("dispatchImageWake — happy path: local file asset", () => {
  it("copies asset, updates manifest, emits visual_asset_ready", async () => {
    // Create a real tmp source file to copy
    const srcFile = path.join(tmpdir(), `parley-src-${Date.now()}.png`);
    await writeFile(srcFile, "fake-png-data", "utf8");

    const worldDir = await makeWorldDir();
    const eventsEmitted = [];

    const mockWakeNpc = async () => ({
      image_markdown: `![A valley](file://${srcFile})`,
    });

    const result = await dispatchImageWake(
      makeBaseArgs({
        worldDir,
        outputTarget: { kind: "background", id: "mountain-valley" },
        wakeNpcFn: mockWakeNpc,
        appendStoryEventFn: async ({ event }) => eventsEmitted.push(event),
      }),
    );

    // Returns ok
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.ok(result.assetPath, "assetPath should be set");

    // Asset is in the expected location
    const expectedDest = path.join(worldDir, "assets", "backgrounds", "mountain-valley.png");
    assert.equal(result.assetPath, expectedDest);
    const copiedContent = await readFile(expectedDest, "utf8");
    assert.equal(copiedContent, "fake-png-data");

    // Manifest updated
    const manifestPath = path.join(worldDir, "assets", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.ok(manifest.backgrounds, "backgrounds key should exist");
    assert.equal(manifest.backgrounds["mountain-valley"].status, "ready");
    assert.equal(manifest.backgrounds["mountain-valley"].path, expectedDest);
    assert.ok(manifest.backgrounds["mountain-valley"].wake_id, "wake_id should be recorded");

    // visual_asset_ready event emitted
    assert.equal(eventsEmitted.length, 1);
    assert.equal(eventsEmitted[0].type, "visual_asset_ready");
    assert.deepEqual(eventsEmitted[0].inputs.target, { kind: "background", id: "mountain-valley" });
    assert.equal(eventsEmitted[0].inputs.path, expectedDest);
  });
});

describe("dispatchImageWake — wake deferred", () => {
  it("returns ok=false, emits visual_asset_deferred, no manifest update", async () => {
    const worldDir = await makeWorldDir();
    const eventsEmitted = [];

    const mockWakeNpc = async () => ({
      status: "wake_deferred",
      reason: "timeout",
    });

    const result = await dispatchImageWake(
      makeBaseArgs({
        worldDir,
        wakeNpcFn: mockWakeNpc,
        appendStoryEventFn: async ({ event }) => eventsEmitted.push(event),
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "deferred");
    assert.equal(result.reason, "timeout");

    // No manifest file written
    const manifestPath = path.join(worldDir, "assets", "manifest.json");
    const manifestExists = await readFile(manifestPath, "utf8").catch(() => null);
    assert.equal(manifestExists, null, "manifest should not be written on deferred");

    // visual_asset_deferred event emitted
    assert.equal(eventsEmitted.length, 1);
    assert.equal(eventsEmitted[0].type, "visual_asset_deferred");
    assert.equal(eventsEmitted[0].inputs.reason, "timeout");
  });
});

describe("dispatchImageWake — no image path in result", () => {
  it("returns ok=false, emits visual_asset_failed", async () => {
    const worldDir = await makeWorldDir();
    const eventsEmitted = [];

    // wakeNpc returns a result with no markdown and no path
    const mockWakeNpc = async () => ({
      image_markdown: "",
      image_path: null,
    });

    const result = await dispatchImageWake(
      makeBaseArgs({
        worldDir,
        wakeNpcFn: mockWakeNpc,
        appendStoryEventFn: async ({ event }) => eventsEmitted.push(event),
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "no image path in result");

    // No manifest
    const manifestPath = path.join(worldDir, "assets", "manifest.json");
    const manifestExists = await readFile(manifestPath, "utf8").catch(() => null);
    assert.equal(manifestExists, null, "manifest should not be written on failed");

    // visual_asset_failed event emitted
    assert.equal(eventsEmitted.length, 1);
    assert.equal(eventsEmitted[0].type, "visual_asset_failed");
    assert.equal(eventsEmitted[0].inputs.reason, "no image path in result");
  });
});

describe("dispatchImageWake — URL asset path", () => {
  it("leaves URL in manifest without copying", async () => {
    const worldDir = await makeWorldDir();
    const eventsEmitted = [];
    const imageUrl = "https://cdn.example.com/images/generated-landscape.png";

    const mockWakeNpc = async () => ({
      image_markdown: `![Generated landscape](${imageUrl})`,
    });

    const result = await dispatchImageWake(
      makeBaseArgs({
        worldDir,
        outputTarget: { kind: "background", id: "generated-bg" },
        wakeNpcFn: mockWakeNpc,
        appendStoryEventFn: async ({ event }) => eventsEmitted.push(event),
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.assetPath, imageUrl);

    // Manifest records the URL
    const manifestPath = path.join(worldDir, "assets", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.backgrounds["generated-bg"].path, imageUrl);
    assert.equal(manifest.backgrounds["generated-bg"].status, "ready");

    // No file was created in backgrounds dir (URL, not local)
    const bgDir = path.join(worldDir, "assets", "backgrounds");
    const bgDirExists = await readFile(path.join(bgDir, "generated-bg.png"), "utf8").catch(() => null);
    assert.equal(bgDirExists, null, "no local file should be created for URL assets");

    // visual_asset_ready event emitted
    assert.equal(eventsEmitted.length, 1);
    assert.equal(eventsEmitted[0].type, "visual_asset_ready");
    assert.equal(eventsEmitted[0].inputs.path, imageUrl);
  });
});

describe("dispatchImageWake — manifest absent: starts fresh", () => {
  it("creates a new manifest when none exists", async () => {
    // Create a world dir but do NOT create assets/ or manifest.json
    const worldDir = await mkdtemp(path.join(tmpdir(), "parley-world-nomanifest-"));

    const srcFile = path.join(tmpdir(), `parley-src-fresh-${Date.now()}.png`);
    await writeFile(srcFile, "fake-png-fresh", "utf8");

    const mockWakeNpc = async () => ({
      image_markdown: `![Portrait](file://${srcFile})`,
    });

    const result = await dispatchImageWake(
      makeBaseArgs({
        worldDir,
        talentName: "portrait-artist",
        outputTarget: { kind: "portrait", id: "hero-character" },
        wakeNpcFn: mockWakeNpc,
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");

    // Manifest was created from scratch
    const manifestPath = path.join(worldDir, "assets", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.ok(manifest.portraits, "portraits key should exist");
    assert.equal(manifest.portraits["hero-character"].status, "ready");
  });
});

describe("dispatchImageWake — portrait target", () => {
  it("stores portrait asset under assets/portraits/", async () => {
    const worldDir = await makeWorldDir();

    const srcFile = path.join(tmpdir(), `parley-portrait-src-${Date.now()}.png`);
    await writeFile(srcFile, "portrait-data", "utf8");

    const mockWakeNpc = async () => ({
      image_markdown: `![Hero portrait](file://${srcFile})`,
    });

    const result = await dispatchImageWake(
      makeBaseArgs({
        worldDir,
        talentName: "portrait-artist",
        outputTarget: { kind: "portrait", id: "hero-npc" },
        wakeNpcFn: mockWakeNpc,
      }),
    );

    assert.equal(result.ok, true);
    const expectedDest = path.join(worldDir, "assets", "portraits", "hero-npc.png");
    assert.equal(result.assetPath, expectedDest);
    const content = await readFile(expectedDest, "utf8");
    assert.equal(content, "portrait-data");
  });
});

describe("dispatchImageWake — security: rejects unsafe local paths", () => {
  it("rejects path with .. segments and emits visual_asset_failed", async () => {
    const worldDir = await makeWorldDir();
    const events = [];

    const mockWakeNpc = async () => ({
      image_markdown: "![evil](file:///tmp/../../etc/passwd)",
    });

    const result = await dispatchImageWake(
      makeBaseArgs({
        worldDir,
        wakeNpcFn: mockWakeNpc,
        appendStoryEventFn: async ({ event }) => events.push(event),
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.match(result.reason, /unsafe image path rejected/);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "visual_asset_failed");
    assert.match(events[0].inputs.reason, /unsafe image path rejected/);
  });

  it("rejects relative path (not absolute) and emits visual_asset_failed", async () => {
    const worldDir = await makeWorldDir();
    const events = [];

    const mockWakeNpc = async () => ({
      image_path: "relative/sneaky.png",
    });

    const result = await dispatchImageWake(
      makeBaseArgs({
        worldDir,
        wakeNpcFn: mockWakeNpc,
        appendStoryEventFn: async ({ event }) => events.push(event),
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.match(result.reason, /unsafe image path rejected/);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "visual_asset_failed");
  });
});
