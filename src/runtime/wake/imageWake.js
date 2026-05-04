/**
 * imageWake.js
 *
 * Image-generation wake handler. Dispatches a parley-image-wake/v1 envelope
 * to a background-artist or portrait-artist talent via the Belayer wake transport,
 * parses the Markdown image response, copies the asset into the world assets dir,
 * updates the assets manifest, and emits a visual_asset_ready story event.
 */

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { wakeNpc } from "./wakeNpc.js";

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/;

/**
 * Dispatch an image-generation wake to an artist talent.
 *
 * @param {object} opts
 * @param {string} opts.instanceDir                  - Path to the materialized instance dir
 * @param {string} opts.worldDir                     - e.g. instances/<world>/<instance>/world
 * @param {string} opts.talentName                   - "background-artist" | "portrait-artist"
 * @param {string} opts.prompt                       - Image generation prompt
 * @param {string} opts.aspectRatio                  - "landscape" | "portrait" | "square"
 * @param {{ kind: "portrait" | "background", id: string }} opts.outputTarget
 * @param {string} opts.storyId
 * @param {string} opts.cragSlug
 * @param {string} opts.sceneId
 * @param {string} opts.currentTurnId
 * @param {Function} [opts.wakeNpcFn]                - Injectable; defaults to wakeNpc
 * @param {Function|null} [opts.validateImageWake]   - Injectable schema validator
 * @param {Function|null} [opts.validateImageWakeResult] - Injectable schema validator
 * @param {Function|null} [opts.appendStoryEventFn]  - Injectable; default no-op
 * @returns {Promise<{ ok: boolean, status: string, assetPath?: string, reason?: string }>}
 */
export async function dispatchImageWake({
  instanceDir,
  worldDir,
  talentName,
  prompt,
  aspectRatio,
  outputTarget,
  storyId,
  cragSlug,
  sceneId,
  currentTurnId,
  // Injectable:
  wakeNpcFn = wakeNpc,
  validateImageWake = null,
  validateImageWakeResult = null,
  appendStoryEventFn = null,
}) {
  const wakeId = `image-${storyId}-${outputTarget.kind}-${outputTarget.id}-${Date.now()}`;
  const envelope = {
    schema_version: "parley-image-wake/v1",
    wake_id: wakeId,
    crag_slug: cragSlug,
    actor_id: talentName,
    prompt,
    aspect_ratio: aspectRatio,
    output_target: outputTarget,
    current_story_context: {
      story_id: storyId,
      scene_id: sceneId,
      current_turn_id: currentTurnId,
      present_event_refs: [],
    },
  };

  if (validateImageWake) validateImageWake(envelope);

  const result = await wakeNpcFn({
    instanceDir,
    characterId: talentName,
    wakeEnvelope: envelope,
    ...(validateImageWake ? { validateWake: validateImageWake } : {}),
    ...(validateImageWakeResult ? { validateWakeResult: validateImageWakeResult } : {}),
  });

  // wake handler may return { status: "wake_deferred", ... }
  if (result?.status === "wake_deferred") {
    if (appendStoryEventFn) {
      await appendStoryEventFn({
        instanceDir,
        storyId,
        event: {
          schema_version: "parley-story-event/v1",
          event_id: `visual-asset-deferred-${wakeId}`,
          story_id: storyId,
          type: "visual_asset_deferred",
          inputs: { reason: result.reason ?? "unknown", target: outputTarget },
          emitted_at: new Date().toISOString(),
        },
      });
    }
    return { ok: false, status: "deferred", reason: result.reason ?? "unknown" };
  }

  // Extract image path/url from Markdown
  const md = result?.image_markdown ?? "";
  const match = MARKDOWN_IMAGE_RE.exec(md);
  let assetPath = result?.image_path ?? (match ? match[1] : null);
  if (!assetPath) {
    if (appendStoryEventFn) {
      await appendStoryEventFn({
        instanceDir,
        storyId,
        event: {
          schema_version: "parley-story-event/v1",
          event_id: `visual-asset-failed-${wakeId}`,
          story_id: storyId,
          type: "visual_asset_failed",
          inputs: { reason: "no image path in result", target: outputTarget },
          emitted_at: new Date().toISOString(),
        },
      });
    }
    return { ok: false, status: "failed", reason: "no image path in result" };
  }

  // Normalize file:// URIs to plain filesystem paths before copying.
  if (/^file:\/\//.test(assetPath)) {
    assetPath = new URL(assetPath).pathname;
  }

  // Copy asset into worldDir/assets/<kind>s/<id>.png
  const destDir = path.join(
    worldDir,
    "assets",
    outputTarget.kind === "portrait" ? "portraits" : "backgrounds",
  );
  await mkdir(destDir, { recursive: true });
  const destPath = path.join(destDir, `${outputTarget.id}.png`);

  // If assetPath is an HTTP(S) URL, leave as-is and store URL in manifest; if local file, copy.
  if (/^https?:\/\//.test(assetPath)) {
    // Defer download to a follow-up; record URL in manifest.
  } else {
    await copyFile(assetPath, destPath);
    assetPath = destPath;
  }

  // Update assets manifest
  const manifestPath = path.join(worldDir, "assets", "manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf8").catch(() => "{}");
  const manifest = JSON.parse(manifestRaw);
  const key = outputTarget.kind === "portrait" ? "portraits" : "backgrounds";
  manifest[key] = manifest[key] ?? {};
  manifest[key][outputTarget.id] = {
    status: "ready",
    path: assetPath,
    generated_at: new Date().toISOString(),
    wake_id: wakeId,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // Emit visual_asset_ready event
  if (appendStoryEventFn) {
    await appendStoryEventFn({
      instanceDir,
      storyId,
      event: {
        schema_version: "parley-story-event/v1",
        event_id: `visual-asset-ready-${wakeId}`,
        story_id: storyId,
        type: "visual_asset_ready",
        inputs: { target: outputTarget, path: assetPath },
        emitted_at: new Date().toISOString(),
      },
    });
  }

  return { ok: true, status: "completed", assetPath };
}
