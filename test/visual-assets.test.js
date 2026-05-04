import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runPlayerTurn, loadCurrentState } from "../src/runtime/parleyRuntime.js";
import { loadScenarioPack } from "../src/runtime/scenarioPacks.js";
import { prepareVisualAssetsForScenario } from "../src/runtime/visualAssets.js";
import { createParleyServer } from "../src/server.js";

import { requestServer } from "./support/inProcessServer.js";

test("visual asset preparation composes reusable portrait and visual novel background prompts", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-visual-assets-"));
  const worldDir = path.join(rootDir, "world");
  await mkdir(worldDir, { recursive: true });
  await writeFile(
    path.join(worldDir, "art-style.md"),
    [
      "# Test World Art Style",
      "",
      "painted lantern realism with rain-soft edges",
      "negative: no glossy CG, no UI text"
    ].join("\n"),
    "utf8"
  );

  const scenario = await loadScenarioPack("last-lantern");
  const result = await prepareVisualAssetsForScenario({
    scenario,
    scene: scenario.scene,
    characters: scenario.characters,
    worldDir
  });

  assert.equal(result.schema_version, "parley-asset-manifest/v1");
  assert.equal(result.world.id, "last-lantern");
  assert.equal(result.assets.length, 2, "one portrait and one scene background request should be prepared");

  const portrait = result.assets.find((asset) => asset.kind === "portrait");
  assert.equal(portrait.id, "portrait:mara-underbough");
  assert.equal(portrait.status, "prompt_ready");
  assert.equal(portrait.aspect_ratio, "portrait");
  assert.equal(portrait.entity_id, "mara-underbough");
  assert.equal(portrait.tool.capability, "image_generate");
  assert.equal(portrait.public_url, null, "missing assets should not get a renderable URL");

  const portraitPrompt = await readFile(path.join(worldDir, "assets", "portraits", "mara-underbough.prompt.md"), "utf8");
  assert.match(portraitPrompt, /painted lantern realism/);
  assert.match(portraitPrompt, /Mara Underbough/);
  assert.match(portraitPrompt, /tavernkeep/);
  assert.match(portraitPrompt, /physical description/i);
  assert.match(portraitPrompt, /image_generate/);
  assert.doesNotMatch(portraitPrompt, /fal|openai image|provider-specific/i);

  const background = result.assets.find((asset) => asset.kind === "background");
  assert.equal(background.id, "background:last-lantern-tavern");
  assert.equal(background.status, "prompt_ready");
  assert.equal(background.aspect_ratio, "landscape");
  assert.equal(background.entity_id, "last-lantern-tavern");

  const backgroundPrompt = await readFile(path.join(worldDir, "assets", "backgrounds", "last-lantern-tavern.prompt.md"), "utf8");
  assert.match(backgroundPrompt, /visual novel background/i);
  assert.match(backgroundPrompt, /bottom third/i);
  assert.match(backgroundPrompt, /no readable text|no UI text/i);

  const manifest = JSON.parse(await readFile(path.join(worldDir, "assets", "manifest.json"), "utf8"));
  assert.deepEqual(
    manifest.assets.map((asset) => asset.id).sort(),
    ["background:last-lantern-tavern", "portrait:mara-underbough"]
  );
});

test("location visual records drive reusable background prompts", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-location-visual-assets-"));
  const worldDir = path.join(rootDir, "world");
  await mkdir(path.join(worldDir, "lore", "locations"), { recursive: true });
  await writeFile(path.join(worldDir, "art-style.md"), "schema_version: parley-art-style/v1\nbackground: test\n", "utf8");
  await writeFile(
    path.join(worldDir, "lore", "locations", "last-lantern-tavern.md"),
    [
      "---",
      "schema_version: parley-location/v1",
      "id: last-lantern-tavern",
      "name: Location Record Tavern",
      "world: last-lantern",
      "visual:",
      "  status: draft",
      "  environment_type: durable location record interior",
      "  time_of_day: location-record-midnight",
      "  landmarks:",
      "    - location record blue hearth",
      "  safe_overlay_zones:",
      "    - bottom third",
      "  negative:",
      "    - no fake scenario landmark",
      "background:",
      "  status: missing",
      "  prompt_path: worlds/last-lantern/assets/backgrounds/location-record.prompt.md",
      "  asset_path: worlds/last-lantern/assets/backgrounds/location-record.png",
      "  aspect_ratio: landscape",
      "---",
      "",
      "# Location Record Tavern"
    ].join("\n"),
    "utf8"
  );

  const scenario = structuredClone(await loadScenarioPack("last-lantern"));
  scenario.scene.visual = {
    status: "draft",
    environment_type: "stale scenario-only interior",
    landmarks: ["stale scenario landmark"]
  };

  const manifest = await prepareVisualAssetsForScenario({ scenario, scene: scenario.scene, characters: scenario.characters, worldDir });
  const background = manifest.assets.find((asset) => asset.kind === "background");
  assert.equal(background.entity_name, "Location Record Tavern");
  assert.equal(background.prompt_path, "assets/backgrounds/location-record.prompt.md");

  const backgroundPrompt = await readFile(path.join(worldDir, "assets", "backgrounds", "location-record.prompt.md"), "utf8");
  assert.match(backgroundPrompt, /location-record-midnight/);
  assert.match(backgroundPrompt, /location record blue hearth/);
  assert.doesNotMatch(backgroundPrompt, /stale scenario landmark/);
});

test("deferred portrait status is preserved and does not request a prompt", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-visual-deferred-"));
  const worldDir = path.join(rootDir, "world");
  const scenario = await loadScenarioPack("neon-afterhours");

  const manifest = await prepareVisualAssetsForScenario({
    scenario,
    scene: scenario.scene,
    characters: scenario.characters,
    worldDir
  });

  const deferred = manifest.assets.find((asset) => asset.id === "portrait:kestrel-9");
  assert.equal(deferred.status, "deferred");
  assert.equal(deferred.public_url, null);
  assert.equal(deferred.prompt_hash, null);
  await assert.rejects(stat(path.join(worldDir, "assets", "portraits", "kestrel-9.prompt.md")), /ENOENT/);
});

test("runtime attaches visual asset requests to world state without generating every turn", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-runtime-visual-assets-"));
  const instanceDir = path.join(rootDir, "state");
  const worldDir = path.join(rootDir, "world");

  const result = await runPlayerTurn({
    playerAction: "I ask who remembers the old north road.",
    instanceDir,
    worldDir
  });

  assert.equal(result.visualAssets.schema_version, "parley-asset-manifest/v1");
  assert.equal(result.worldState.visual_assets.schema_version, "parley-asset-manifest/v1");
  assert.ok(result.visualAssets.assets.some((asset) => asset.id === "portrait:mara-underbough"));
  assert.ok(result.visualAssets.assets.some((asset) => asset.id === "background:last-lantern-tavern"));
  assert.ok(result.characters.find((character) => character.id === "mara-underbough")?.visual);
  assert.equal(result.characters.find((character) => character.id === "mara-underbough")?.portrait.status, "prompt_ready");

  await stat(path.join(worldDir, "assets", "manifest.json"));
  await stat(path.join(worldDir, "assets", "portraits", "mara-underbough.prompt.md"));
  await stat(path.join(worldDir, "assets", "backgrounds", "last-lantern-tavern.prompt.md"));

  const turnLog = await readFile(path.join(instanceDir, "turns.jsonl"), "utf8");
  assert.match(turnLog, /visual_assets/);
  assert.doesNotMatch(turnLog, /image_data|base64|generated-on-turn/);
});

test("scenario worlds define art styles and durable location visual records", async () => {
  for (const scenarioId of ["last-lantern", "neon-afterhours", "orchard-welcome"]) {
    const scenario = await loadScenarioPack(scenarioId);
    const artStyle = await readFile(path.join(scenario.worldDir, "art-style.md"), "utf8");
    assert.match(artStyle, /schema_version: parley-art-style\/v1/);
    assert.match(artStyle, /background:/);
    assert.match(artStyle, /Background Direction/i);

    const location = await readFile(path.join(scenario.worldDir, "lore", "locations", `${scenario.scene.id}.md`), "utf8");
    assert.match(location, /schema_version: parley-location\/v1/);
    assert.match(location, new RegExp(`id: ${scenario.scene.id}`));
    assert.match(location, /visual:/);
    assert.match(location, /background:/);
    assert.match(location, /safe_overlay_zones:/);
  }
});

test("visual asset preparation rejects paths that escape world assets", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-visual-paths-"));
  const worldDir = path.join(rootDir, "world");
  await mkdir(worldDir, { recursive: true });
  const scenario = structuredClone(await loadScenarioPack("last-lantern"));
  scenario.characters[0].portrait.prompt_path = "worlds/last-lantern/assets/../../escaped.prompt.md";

  await assert.rejects(
    prepareVisualAssetsForScenario({
      scenario,
      scene: scenario.scene,
      characters: scenario.characters,
      worldDir
    }),
    /unsafe visual asset path/i
  );

  await assert.rejects(stat(path.join(rootDir, "escaped.prompt.md")), /ENOENT/);
});

test("visual asset preparation refuses to overwrite prompt symlinks", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-visual-symlink-prompt-"));
  const worldDir = path.join(rootDir, "world");
  const promptDir = path.join(worldDir, "assets", "portraits");
  const outside = path.join(rootDir, "outside.txt");
  await mkdir(promptDir, { recursive: true });
  await writeFile(outside, "DO NOT OVERWRITE", "utf8");
  await symlink(outside, path.join(promptDir, "mara-underbough.prompt.md"));

  const scenario = await loadScenarioPack("last-lantern");
  await assert.rejects(
    prepareVisualAssetsForScenario({ scenario, scene: scenario.scene, characters: scenario.characters, worldDir }),
    /unsafe visual asset path/i
  );
  assert.equal(await readFile(outside, "utf8"), "DO NOT OVERWRITE");
});

test("non-default scenario asset urls keep scenario identity", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-visual-neon-url-"));
  const worldDir = path.join(rootDir, "world");
  const portraitDir = path.join(worldDir, "assets", "portraits");
  await mkdir(portraitDir, { recursive: true });
  await writeFile(path.join(portraitDir, "veyra-sol.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const scenario = await loadScenarioPack("neon-afterhours");
  const manifest = await prepareVisualAssetsForScenario({
    scenario,
    scene: scenario.scene,
    characters: scenario.characters,
    worldDir
  });
  const portrait = manifest.assets.find((asset) => asset.id === "portrait:veyra-sol");
  assert.equal(portrait.status, "generated");
  assert.equal(portrait.public_url, "/world-assets/assets/portraits/veyra-sol.png?scenario=neon-afterhours");
});

test("prompt-ready hash updates when prompt content changes", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-visual-hash-"));
  const worldDir = path.join(rootDir, "world");
  const scenario = await loadScenarioPack("last-lantern");
  const first = await prepareVisualAssetsForScenario({ scenario, scene: scenario.scene, characters: scenario.characters, worldDir });
  const firstHash = first.assets.find((asset) => asset.id === "portrait:mara-underbough").prompt_hash;
  const changedScenario = structuredClone(scenario);
  changedScenario.characters[0].visual.physical_description = "changed visual trait for hash regression";
  const second = await prepareVisualAssetsForScenario({
    scenario: changedScenario,
    scene: changedScenario.scene,
    characters: changedScenario.characters,
    worldDir
  });
  const secondHash = second.assets.find((asset) => asset.id === "portrait:mara-underbough").prompt_hash;
  assert.notEqual(secondHash, firstHash);
});

test("locked visual prompts are not overwritten and missing images do not get public urls", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-visual-locked-"));
  const worldDir = path.join(rootDir, "world");
  const promptPath = path.join(worldDir, "assets", "portraits", "mara-underbough.prompt.md");
  await mkdir(path.dirname(promptPath), { recursive: true });
  await writeFile(promptPath, "KEEP THIS LOCKED PROMPT", "utf8");
  await writeFile(
    path.join(worldDir, "assets", "manifest.json"),
    JSON.stringify({
      schema_version: "parley-asset-manifest/v1",
      world: { id: "last-lantern" },
      assets: [
        {
          id: "portrait:mara-underbough",
          kind: "portrait",
          entity_id: "mara-underbough",
          status: "locked",
          prompt_path: "assets/portraits/mara-underbough.prompt.md",
          asset_path: "assets/portraits/mara-underbough.png",
          public_url: "/world-assets/assets/portraits/mara-underbough.png?scenario=last-lantern"
        }
      ]
    }, null, 2),
    "utf8"
  );

  const scenario = await loadScenarioPack("last-lantern");
  const manifest = await prepareVisualAssetsForScenario({
    scenario,
    scene: scenario.scene,
    characters: scenario.characters,
    worldDir
  });

  const portrait = manifest.assets.find((asset) => asset.id === "portrait:mara-underbough");
  assert.equal(portrait.status, "locked");
  assert.equal(portrait.public_url, null, "locked metadata without a real image should not expose a dead URL");
  assert.equal(await readFile(promptPath, "utf8"), "KEEP THIS LOCKED PROMPT");
});

test("locked generated asset with missing prompt writes a fresh prompt hash", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-visual-missing-locked-prompt-"));
  const worldDir = path.join(rootDir, "world");
  await mkdir(path.join(worldDir, "assets"), { recursive: true });
  await writeFile(
    path.join(worldDir, "assets", "manifest.json"),
    JSON.stringify({
      schema_version: "parley-asset-manifest/v1",
      world: { id: "last-lantern" },
      assets: [
        {
          id: "portrait:mara-underbough",
          kind: "portrait",
          entity_id: "mara-underbough",
          status: "locked",
          prompt_hash: "OLD_LOCKED_HASH",
          prompt_path: "assets/portraits/mara-underbough.prompt.md",
          asset_path: "assets/portraits/mara-underbough.png"
        }
      ]
    }, null, 2),
    "utf8"
  );

  const scenario = await loadScenarioPack("last-lantern");
  const manifest = await prepareVisualAssetsForScenario({
    scenario,
    scene: scenario.scene,
    characters: scenario.characters,
    worldDir
  });

  const portrait = manifest.assets.find((asset) => asset.id === "portrait:mara-underbough");
  const writtenPrompt = await readFile(path.join(worldDir, "assets", "portraits", "mara-underbough.prompt.md"), "utf8");
  assert.equal(portrait.status, "locked");
  assert.notEqual(portrait.prompt_hash, "OLD_LOCKED_HASH");
  assert.match(portrait.prompt_hash, /^[a-f0-9]{64}$/);
  assert.match(writtenPrompt, /Mara Underbough/);
});

test("loadCurrentState reloads updated visual manifest instead of stale world-state asset data", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-visual-state-refresh-"));
  const instanceDir = path.join(rootDir, "state");
  const worldDir = path.join(rootDir, "world");

  await runPlayerTurn({
    playerAction: "I ask who remembers the old north road.",
    instanceDir,
    worldDir
  });

  const imagePath = path.join(worldDir, "assets", "portraits", "mara-underbough.png");
  await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const scenario = await loadScenarioPack("last-lantern");
  await prepareVisualAssetsForScenario({ scenario, scene: scenario.scene, characters: scenario.characters, worldDir });

  const state = await loadCurrentState({ scenarioId: "last-lantern", instanceDir, worldDir });
  const portrait = state.visualAssets.assets.find((asset) => asset.id === "portrait:mara-underbough");
  assert.equal(portrait.status, "generated");
  assert.equal(portrait.public_url, "/world-assets/assets/portraits/mara-underbough.png?scenario=last-lantern");
});

test("server only serves image assets and includes nosniff", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "parley-world-asset-route-"));
  const worldDir = path.join(rootDir, "world");
  const instanceDir = path.join(rootDir, "state");
  const portraitDir = path.join(worldDir, "assets", "portraits");
  await mkdir(portraitDir, { recursive: true });
  await writeFile(path.join(portraitDir, "mara-underbough.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const outsideImage = path.join(rootDir, "outside.png");
  await writeFile(outsideImage, "SYMLINK_SECRET", "utf8");

  const server = createParleyServer({ instanceDir, worldDir });
  const ok = await requestServer(server, { method: "GET", url: "/world-assets/assets/portraits/mara-underbough.png" });
  assert.equal(ok.status, 200);
  assert.match(ok.headers["content-type"], /image\/png/);
  assert.equal(ok.headers["x-content-type-options"], "nosniff");
  assert.equal(ok.bodyBytes.toString("hex"), "89504e47");

  await writeFile(path.join(worldDir, "assets", "manifest.json"), "{}", "utf8");
  await writeFile(path.join(portraitDir, "mara-underbough.prompt.md"), "secret prompt", "utf8");
  const manifest = await requestServer(server, { method: "GET", url: "/world-assets/assets/manifest.json" });
  assert.equal(manifest.status, 404);
  const prompt = await requestServer(server, { method: "GET", url: "/world-assets/assets/portraits/mara-underbough.prompt.md" });
  assert.equal(prompt.status, 404);

  await symlink(outsideImage, path.join(portraitDir, "leak.png"));
  const leak = await requestServer(server, { method: "GET", url: "/world-assets/assets/portraits/leak.png" });
  assert.equal(leak.status, 404);

  await symlink(path.join(portraitDir, "mara-underbough.prompt.md"), path.join(portraitDir, "prompt-leak.png"));
  const promptLeak = await requestServer(server, { method: "GET", url: "/world-assets/assets/portraits/prompt-leak.png" });
  assert.equal(promptLeak.status, 404);

  const traversal = await requestServer(server, { method: "GET", url: "/world-assets/../scenario.json" });
  assert.equal(traversal.status, 404);
});
