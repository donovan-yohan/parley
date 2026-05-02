import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestSchemaVersion = "parley-asset-manifest/v1";
const promptSchemaVersion = "parley-visual-prompt/v1";
const imageTool = {
  toolset: "image_gen",
  capability: "image_generate"
};

export async function prepareVisualAssetsForScenario({ scenario, scene = scenario.scene, characters = scenario.characters, worldDir }) {
  if (!scenario?.world?.id) {
    throw new Error("scenario.world.id is required to prepare visual assets");
  }
  if (!worldDir) {
    throw new Error("worldDir is required to prepare visual assets");
  }

  const styleGuide = await readWorldArtStyle({ scenario, worldDir });
  const previousManifest = await readAssetManifest(worldDir);
  const assets = [];

  for (const character of characters ?? []) {
    assets.push(await preparePortraitAsset({ scenario, scene, character, worldDir, styleGuide, previousManifest }));
  }

  assets.push(await prepareBackgroundAsset({ scenario, scene, worldDir, styleGuide, previousManifest }));

  const manifest = {
    schema_version: manifestSchemaVersion,
    world: scenario.world,
    tool: imageTool,
    assets: mergeAssets(previousManifest?.assets, assets)
  };

  await mkdir(path.join(worldDir, "assets"), { recursive: true });
  await safeWriteWorldAssetFile({
    worldDir,
    relativePath: "assets/manifest.json",
    content: `${JSON.stringify(manifest, null, 2)}\n`,
    expectedKind: "manifest"
  });

  return manifest;
}

export async function loadVisualAssetManifest(worldDir) {
  return await readAssetManifest(worldDir) ?? {
    schema_version: manifestSchemaVersion,
    world: null,
    tool: imageTool,
    assets: []
  };
}

export function attachVisualAssetsToCharacters({ characters, visualAssets }) {
  const assets = visualAssets?.assets ?? [];
  return (characters ?? []).map((character) => {
    const portrait = assets.find((asset) => asset.kind === "portrait" && asset.entity_id === character.id);
    if (!portrait) {
      return character;
    }
    return {
      ...character,
      visual: character.visual ?? portrait.visual_profile ?? defaultCharacterVisual(character),
      portrait: {
        ...(character.portrait ?? {}),
        status: portrait.status,
        prompt_path: portrait.prompt_path,
        asset_path: portrait.asset_path,
        public_url: portrait.public_url,
        asset_id: portrait.id
      }
    };
  });
}

async function preparePortraitAsset({ scenario, scene, character, worldDir, styleGuide, previousManifest }) {
  const entityId = character.id;
  const asset = createAssetRecord({
    previousManifest,
    id: `portrait:${entityId}`,
    kind: "portrait",
    entityType: "character",
    entityId,
    entityName: character.name,
    worldDir,
    promptRelativePath: sanitizeWorldAssetPath({
      value: character.portrait?.prompt_path,
      worldId: scenario.world.id,
      fallback: `assets/portraits/${entityId}.prompt.md`,
      expectedKind: "prompt"
    }),
    assetRelativePath: sanitizeWorldAssetPath({
      value: character.portrait?.asset_path,
      worldId: scenario.world.id,
      fallback: `assets/portraits/${entityId}.png`,
      expectedKind: "image"
    }),
    scenarioId: scenario.id,
    aspectRatio: character.portrait?.aspect_ratio ?? "portrait",
    visualProfile: character.visual ?? defaultCharacterVisual(character)
  });
  const prompt = composePortraitPrompt({ scenario, scene, character, asset, styleGuide });
  asset.prompt_hash = ["generated", "locked"].includes(asset.status) && asset.previous_prompt_hash
    ? asset.previous_prompt_hash
    : hashPrompt(prompt);
  delete asset.previous_prompt_hash;
  await writePrompt({ worldDir, relativePath: asset.prompt_path, prompt, skipIfExists: ["generated", "locked"].includes(asset.status) });
  return asset;
}

async function prepareBackgroundAsset({ scenario, scene, worldDir, styleGuide, previousManifest }) {
  const entityId = scene.id;
  const sceneBackground = scene.background ?? {};
  const asset = createAssetRecord({
    previousManifest,
    id: `background:${entityId}`,
    kind: "background",
    entityType: "location",
    entityId,
    entityName: scene.title,
    worldDir,
    promptRelativePath: sanitizeWorldAssetPath({
      value: sceneBackground.prompt_path,
      worldId: scenario.world.id,
      fallback: `assets/backgrounds/${entityId}.prompt.md`,
      expectedKind: "prompt"
    }),
    assetRelativePath: sanitizeWorldAssetPath({
      value: sceneBackground.asset_path,
      worldId: scenario.world.id,
      fallback: `assets/backgrounds/${entityId}.png`,
      expectedKind: "image"
    }),
    scenarioId: scenario.id,
    aspectRatio: sceneBackground.aspect_ratio ?? "landscape",
    visualProfile: scene.visual ?? defaultSceneVisual(scene)
  });
  const prompt = composeBackgroundPrompt({ scenario, scene, asset, styleGuide });
  asset.prompt_hash = ["generated", "locked"].includes(asset.status) && asset.previous_prompt_hash
    ? asset.previous_prompt_hash
    : hashPrompt(prompt);
  delete asset.previous_prompt_hash;
  await writePrompt({ worldDir, relativePath: asset.prompt_path, prompt, skipIfExists: ["generated", "locked"].includes(asset.status) });
  return asset;
}

function createAssetRecord({
  previousManifest,
  id,
  kind,
  entityType,
  entityId,
  entityName,
  worldDir,
  promptRelativePath,
  assetRelativePath,
  scenarioId,
  aspectRatio,
  visualProfile
}) {
  const previous = previousManifest?.assets?.find((asset) => asset.id === id);
  const assetExists = fileExistsSyncish(path.join(worldDir, assetRelativePath));
  const status = previous?.status === "locked"
    ? "locked"
    : assetExists
      ? "generated"
      : "prompt_ready";
  const publicUrl = ["generated", "locked"].includes(status) && assetExists
    ? `/world-assets/${assetRelativePath}?scenario=${encodeURIComponent(scenarioId)}`
    : null;

  return {
    schema_version: "parley-visual-asset/v1",
    id,
    kind,
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    status,
    aspect_ratio: aspectRatio,
    prompt_path: promptRelativePath,
    asset_path: assetRelativePath,
    public_url: publicUrl,
    prompt_hash: previous?.prompt_hash,
    previous_prompt_hash: previous?.prompt_hash,
    stable_scope: "stable-per-entity",
    tool: imageTool,
    visual_profile: visualProfile,
    provenance: {
      prompt_schema_version: promptSchemaVersion,
      generated_by: "artist-talent-with-hermes-image-gen",
      provider: "hermes-managed"
    }
  };
}

async function writePrompt({ worldDir, relativePath, prompt, skipIfExists = false }) {
  const promptPath = path.join(worldDir, relativePath);
  if (skipIfExists && fileExistsSyncish(promptPath)) {
    await assertWorldAssetContainment({ worldDir, relativePath, expectedKind: "prompt" });
    return;
  }
  await safeWriteWorldAssetFile({ worldDir, relativePath, content: prompt, expectedKind: "prompt" });
}

async function safeWriteWorldAssetFile({ worldDir, relativePath, content, expectedKind }) {
  const filePath = path.join(worldDir, relativePath);
  await assertWorldAssetContainment({ worldDir, relativePath, expectedKind });
  await mkdir(path.dirname(filePath), { recursive: true });
  await assertRealParentInsideAssets({ worldDir, filePath });
  await assertNotSymlink(filePath);
  await writeFile(filePath, content, "utf8");
}

function composePortraitPrompt({ scenario, scene, character, asset, styleGuide }) {
  const visual = asset.visual_profile ?? defaultCharacterVisual(character);
  return [
    "---",
    `schema_version: ${promptSchemaVersion}`,
    `asset_id: ${asset.id}`,
    "asset_kind: portrait",
    `entity_id: ${character.id}`,
    `world: ${scenario.world.id}`,
    `aspect_ratio: ${asset.aspect_ratio}`,
    "tool: hermes.image_generate",
    "---",
    "",
    "# Hermes image_generate request",
    "",
    `Call image_generate with aspect_ratio=\"${asset.aspect_ratio}\" after reviewing this prompt. Do not bind Parley to any backend-specific API; Hermes owns the image generation provider.`,
    "",
    "## World Art Style",
    "",
    styleGuide,
    "",
    "## Character",
    "",
    `Name: ${character.name}`,
    `Role: ${character.role ?? "unspecified"}`,
    `Scene: ${scene.title}`,
    `Tone: ${character.tone ?? scenario.world.tone ?? "unspecified"}`,
    "",
    "## Physical Description / Stable Visual Traits",
    "",
    formatVisualProfile(visual),
    "",
    "## Composition",
    "",
    "Bust portrait, shoulders-up. Specific lived-in face. Wardrobe and props communicate role and world. No baked-in text, labels, UI, logos, or story spoilers.",
    "",
    "## Negative Constraints",
    "",
    formatList([...(visual.negative ?? []), "no readable text", "no UI chrome", "no generic stock portrait"])
  ].join("\n");
}

function composeBackgroundPrompt({ scenario, scene, asset, styleGuide }) {
  const visual = asset.visual_profile ?? defaultSceneVisual(scene);
  return [
    "---",
    `schema_version: ${promptSchemaVersion}`,
    `asset_id: ${asset.id}`,
    "asset_kind: background",
    `entity_id: ${scene.id}`,
    `world: ${scenario.world.id}`,
    `aspect_ratio: ${asset.aspect_ratio}`,
    "tool: hermes.image_generate",
    "---",
    "",
    "# Hermes image_generate request",
    "",
    `Call image_generate with aspect_ratio=\"${asset.aspect_ratio}\". This must be a reusable visual novel background, not a per-turn illustration.`,
    "",
    "## World Art Style",
    "",
    styleGuide,
    "",
    "## Location / Scene",
    "",
    `Location: ${scene.title}`,
    `World: ${scenario.world.name}`,
    `Premise: ${scenario.world.premise}`,
    "",
    "## Visual Novel Background Requirements",
    "",
    formatVisualProfile(visual),
    "",
    "Wide establishing composition. No player character. Keep the bottom third and center lower third low-noise so Parley's transcript/input overlay remains readable. Do not bake text, labels, UI panels, or logos into the image.",
    "",
    "## Negative Constraints",
    "",
    formatList([...(visual.negative ?? []), "no readable text", "no UI text", "no foreground player character"])
  ].join("\n");
}

function defaultCharacterVisual(character) {
  return {
    status: "draft",
    physical_description: `${character.name} should have a stable, specific physical description generated from their role (${character.role ?? "unknown role"}) before final art production.`,
    wardrobe: [`role-readable ${character.role ?? "story"} clothing`],
    signature_props: [],
    palette_hints: [],
    negative: []
  };
}

function defaultSceneVisual(scene) {
  return {
    status: "draft",
    environment_type: "story location",
    composition: "visual novel background, wide establishing shot",
    landmarks: [scene.title],
    safe_overlay_zones: ["bottom third", "center lower third"],
    negative: ["no readable text/signage"]
  };
}

function formatVisualProfile(visual) {
  if (!visual || typeof visual !== "object") {
    return "- physical description: not yet provided";
  }

  return Object.entries(visual)
    .filter(([, value]) => value !== undefined && value !== null && keyIsPromptSafe(value))
    .map(([key, value]) => `- ${humanizeKey(key)}: ${formatValue(value)}`)
    .join("\n") || "- physical description: not yet provided";
}

function keyIsPromptSafe(value) {
  return typeof value !== "object" || Array.isArray(value);
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return value.join("; ");
  }
  return String(value);
}

function formatList(items) {
  const unique = [...new Set(items.filter(Boolean))];
  return unique.length ? unique.map((item) => `- ${item}`).join("\n") : "- no extra negative constraints";
}

function humanizeKey(key) {
  return key.replaceAll("_", " ");
}

async function readWorldArtStyle({ scenario, worldDir }) {
  const style = await readTextIfExists(path.join(worldDir, "art-style.md"));
  if (style) {
    return style.trim();
  }
  return [
    `World: ${scenario.world.name}`,
    `Tone: ${scenario.world.tone ?? "unspecified"}`,
    `Premise: ${scenario.world.premise ?? "unspecified"}`,
    "Negative: no generic stock art, no readable UI text, no provider-specific style hacks."
  ].join("\n");
}

async function readAssetManifest(worldDir) {
  const raw = await readTextIfExists(path.join(worldDir, "assets", "manifest.json"));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function mergeAssets(previous = [], next = []) {
  const merged = new Map();
  for (const asset of [...previous, ...next]) {
    if (asset?.id) {
      merged.set(asset.id, asset);
    }
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function sanitizeWorldAssetPath({ value, worldId, fallback, expectedKind }) {
  const candidate = normalizeWorldRelativePath(value, worldId) ?? fallback;
  const normalized = path.posix.normalize(candidate.replaceAll("\\", "/"));
  if (
    path.isAbsolute(candidate) ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized === ".." ||
    !normalized.startsWith("assets/") ||
    !isAllowedAssetExtension(normalized, expectedKind)
  ) {
    throw new Error(`Unsafe visual asset path: ${value ?? fallback}`);
  }
  return normalized;
}

async function assertWorldAssetContainment({ worldDir, relativePath, expectedKind }) {
  if (!isAllowedAssetExtension(relativePath, expectedKind)) {
    throw new Error(`Unsafe visual asset path: ${relativePath}`);
  }
  const assetsDir = path.resolve(worldDir, "assets");
  const filePath = path.resolve(worldDir, relativePath);
  if (!filePath.startsWith(`${assetsDir}${path.sep}`)) {
    throw new Error(`Unsafe visual asset path: ${relativePath}`);
  }
}

async function assertRealParentInsideAssets({ worldDir, filePath }) {
  const assetsDir = path.resolve(worldDir, "assets");
  const [realAssetsDir, realParentDir] = await Promise.all([
    realpath(assetsDir),
    realpath(path.dirname(filePath))
  ]);
  if (realParentDir !== realAssetsDir && !realParentDir.startsWith(`${realAssetsDir}${path.sep}`)) {
    throw new Error(`Unsafe visual asset path: ${filePath}`);
  }
}

async function assertNotSymlink(filePath) {
  try {
    const info = await lstat(filePath);
    if (info.isSymbolicLink()) {
      throw new Error(`Unsafe visual asset path: ${filePath}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function isAllowedAssetExtension(relativePath, expectedKind) {
  if (expectedKind === "prompt") {
    return relativePath.endsWith(".prompt.md");
  }
  if (expectedKind === "manifest") {
    return relativePath === "assets/manifest.json";
  }
  return /\.(png|jpe?g|webp)$/i.test(relativePath);
}

function normalizeWorldRelativePath(value, worldId) {
  if (!value) {
    return null;
  }
  const withoutAnchor = String(value).split("#")[0];
  const worldPrefix = `worlds/${worldId}/`;
  if (withoutAnchor.startsWith(worldPrefix)) {
    return withoutAnchor.slice(worldPrefix.length);
  }
  if (withoutAnchor.startsWith("assets/")) {
    return withoutAnchor;
  }
  if (withoutAnchor.includes("/assets/")) {
    return withoutAnchor.slice(withoutAnchor.indexOf("/assets/") + 1);
  }
  return null;
}

function fileExistsSyncish(filePath) {
  return existsSync(filePath);
}

function hashPrompt(prompt) {
  return createHash("sha256").update(prompt).digest("hex");
}
