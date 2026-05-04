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

// Per-worldDir manifest lock: serializes concurrent read-modify-write of manifest.json.
const manifestLocks = new Map();
async function withManifestLock(worldDir, fn) {
  const prev = manifestLocks.get(worldDir) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  manifestLocks.set(worldDir, next.catch(() => {}));
  return next;
}

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

  // Transport-level deferred
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

  // Artist-level deferred / aborted (parley-image-wake-result/v1 status field)
  if (result?.status === "deferred") {
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

  if (result?.status === "aborted") {
    if (appendStoryEventFn) {
      await appendStoryEventFn({
        instanceDir,
        storyId,
        event: {
          schema_version: "parley-story-event/v1",
          event_id: `visual-asset-aborted-${wakeId}`,
          story_id: storyId,
          type: "visual_asset_aborted",
          inputs: { reason: result.reason ?? "unknown", target: outputTarget },
          emitted_at: new Date().toISOString(),
        },
      });
    }
    return { ok: false, status: "aborted", reason: result.reason ?? "unknown" };
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

  // Capture the RAW pre-normalization path so we can detect `..` traversal
  // attempts. Both new URL().pathname and path.normalize() collapse `..`
  // segments away, so the security check has to look at the original string.
  const rawAssetPath = assetPath;

  // Normalize file:// URIs to plain filesystem paths before copying.
  if (/^file:\/\//.test(assetPath)) {
    assetPath = new URL(assetPath).pathname;
  }

  // Compute destination — always under worldDir/assets/<kind>s/<id>.png
  const kindFolder = outputTarget.kind === "portrait" ? "portraits" : "backgrounds";
  const destDir = path.join(worldDir, "assets", kindFolder);
  const destPath = path.join(destDir, `${outputTarget.id}.png`);

  // Web-relative path served by the Parley server under /world-assets/
  // (relative to worldDir, so browsers can load it via GET /world-assets/...)
  const webPath = `/world-assets/assets/${kindFolder}/${outputTarget.id}.png`;

  let finalAssetPath;

  if (/^https?:\/\//.test(assetPath)) {
    // HTTPS asset: leave URL in manifest, no local copy. mkdir below is skipped
    // for this branch — no local file lands.
    // NOTE: HTTP download to a local cache is a deferred follow-up.
    finalAssetPath = assetPath;
  } else {
    // Local file source. Defense in depth: reject any path containing `..`
    // segments in the RAW pre-normalization string (both new URL().pathname
    // and path.normalize collapse `..` away, so checking the normalized form
    // misses traversal attempts). Also reject non-absolute paths. Hermes
    // image paths are trusted in principle, but a malformed wake_result
    // must not be able to copy /etc/passwd into a web-accessible assets dir.
    const rawSegments = rawAssetPath.split(/[\\/]/);
    const hasTraversal = rawSegments.includes("..");
    if (hasTraversal || !path.isAbsolute(assetPath)) {
      if (appendStoryEventFn) {
        await appendStoryEventFn({
          instanceDir,
          storyId,
          event: {
            schema_version: "parley-story-event/v1",
            event_id: `visual-asset-failed-${wakeId}`,
            story_id: storyId,
            type: "visual_asset_failed",
            inputs: {
              reason: "unsafe image path rejected",
              target: outputTarget,
              attempted_path: assetPath,
            },
            emitted_at: new Date().toISOString(),
          },
        });
      }
      return { ok: false, status: "failed", reason: "unsafe image path rejected" };
    }

    // Wrap copy + manifest update in try/catch; emit visual_asset_failed on I/O error.
    try {
      await mkdir(destDir, { recursive: true });
      await copyFile(assetPath, destPath);
    } catch (err) {
      if (appendStoryEventFn) {
        await appendStoryEventFn({
          instanceDir,
          storyId,
          event: {
            schema_version: "parley-story-event/v1",
            event_id: `visual-asset-failed-${wakeId}`,
            story_id: storyId,
            type: "visual_asset_failed",
            inputs: { reason: err.message ?? "file copy failed", target: outputTarget },
            emitted_at: new Date().toISOString(),
          },
        });
      }
      return { ok: false, status: "failed", reason: err.message ?? "file copy failed" };
    }

    finalAssetPath = destPath;
  }

  // Update assets manifest — serialized per worldDir to avoid read-modify-write race.
  try {
    await withManifestLock(worldDir, async () => {
      const manifestPath = path.join(worldDir, "assets", "manifest.json");
      let manifest;
      try {
        const manifestRaw = await readFile(manifestPath, "utf8");
        manifest = JSON.parse(manifestRaw);
      } catch {
        manifest = null;
      }

      // Respect parley-asset-manifest/v1 shape (arrays, not maps).
      if (manifest?.schema_version === "parley-asset-manifest/v1") {
        const key = outputTarget.kind === "portrait" ? "portraits" : "backgrounds";
        if (!Array.isArray(manifest[key])) manifest[key] = [];
        const entry = {
          id: outputTarget.id,
          path: finalAssetPath,
          web_path: webPath,
          status: "ready",
          generated_at: new Date().toISOString(),
          wake_id: wakeId,
        };
        const existingIdx = manifest[key].findIndex((e) => e.id === outputTarget.id);
        if (existingIdx >= 0) {
          manifest[key][existingIdx] = entry;
        } else {
          manifest[key].push(entry);
        }
      } else {
        // No existing manifest or unknown schema: create fresh parley-asset-manifest/v1.
        // If there was an existing manifest with unrelated keys, preserve them.
        const existing = manifest ?? {};
        const key = outputTarget.kind === "portrait" ? "portraits" : "backgrounds";
        const entry = {
          id: outputTarget.id,
          path: finalAssetPath,
          web_path: webPath,
          status: "ready",
          generated_at: new Date().toISOString(),
          wake_id: wakeId,
        };
        // Preserve unrelated top-level keys; upgrade to v1 shape.
        manifest = {
          ...existing,
          schema_version: "parley-asset-manifest/v1",
          portraits: existing.portraits ?? [],
          backgrounds: existing.backgrounds ?? [],
        };
        // Migrate old map-format keys if present (backward compat for existing test fixtures).
        if (!Array.isArray(manifest.portraits)) manifest.portraits = [];
        if (!Array.isArray(manifest.backgrounds)) manifest.backgrounds = [];
        const arr = manifest[key];
        const existingIdx = arr.findIndex((e) => e.id === outputTarget.id);
        if (existingIdx >= 0) {
          arr[existingIdx] = entry;
        } else {
          arr.push(entry);
        }
      }

      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    });
  } catch (err) {
    if (appendStoryEventFn) {
      await appendStoryEventFn({
        instanceDir,
        storyId,
        event: {
          schema_version: "parley-story-event/v1",
          event_id: `visual-asset-failed-${wakeId}`,
          story_id: storyId,
          type: "visual_asset_failed",
          inputs: { reason: err.message ?? "manifest write failed", target: outputTarget },
          emitted_at: new Date().toISOString(),
        },
      });
    }
    return { ok: false, status: "failed", reason: err.message ?? "manifest write failed" };
  }

  // Emit visual_asset_ready event with both filesystem path and web-relative path.
  if (appendStoryEventFn) {
    await appendStoryEventFn({
      instanceDir,
      storyId,
      event: {
        schema_version: "parley-story-event/v1",
        event_id: `visual-asset-ready-${wakeId}`,
        story_id: storyId,
        type: "visual_asset_ready",
        inputs: { target: outputTarget, path: finalAssetPath, web_path: webPath },
        emitted_at: new Date().toISOString(),
      },
    });
  }

  return { ok: true, status: "completed", assetPath: finalAssetPath };
}
