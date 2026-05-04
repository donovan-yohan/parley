/**
 * worlds-loader/index.ts
 *
 * Fetches, validates, and lazy-loads world bundles.
 *
 * loadWorldManifest()     — fetches /world-manifest.json, validates via Zod.
 * loadWorldBundle()       — lazy-imports a world bundle by worldId + manifest entry.
 * WorldLoadError          — structured error thrown on bundle load failure.
 */

import { parseWorldManifest } from "../contracts/worldManifest.ts";
import type { WorldManifest, WorldManifestEntry } from "../contracts/worldManifest.ts";

// ─── WorldLoadError ───────────────────────────────────────────────────────────

/**
 * Thrown (or resolved with .ok = false in safe-mode) when a world bundle
 * fails to load. The `cause` field carries the original error.
 */
export class WorldLoadError extends Error {
  readonly worldId: string;
  readonly cause: unknown;

  constructor(worldId: string, message: string, cause?: unknown) {
    super(message);
    this.name = "WorldLoadError";
    this.worldId = worldId;
    this.cause = cause;
  }
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

/**
 * Fetch, parse, and validate the world manifest from /world-manifest.json.
 *
 * @throws WorldLoadError on HTTP error or Zod validation failure.
 */
export async function loadWorldManifest(): Promise<WorldManifest> {
  const url = "/world-manifest.json";
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new WorldLoadError("(manifest)", `Network error fetching ${url}`, err);
  }

  if (!response.ok) {
    throw new WorldLoadError(
      "(manifest)",
      `HTTP ${response.status} fetching ${url}`
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    throw new WorldLoadError("(manifest)", `Failed to parse ${url} as JSON`, err);
  }

  try {
    return parseWorldManifest(raw);
  } catch (err) {
    throw new WorldLoadError(
      "(manifest)",
      `world-manifest.json failed schema validation`,
      err
    );
  }
}

// ─── Bundle loader ────────────────────────────────────────────────────────────

/**
 * Load a world bundle identified by its manifest entry.
 *
 * For shell:"default" + entryUrl:null → theme-only world; no-op success.
 * For non-null entryUrl → dynamic-imports the bundle URL, optionally
 *   verifying subresource integrity via fetch + crypto.subtle.digest.
 *
 * @throws WorldLoadError on 404, integrity mismatch, or eval error.
 */
export async function loadWorldBundle(
  worldId: string,
  entry: WorldManifestEntry
): Promise<void> {
  // Theme-only world — nothing to load.
  if (entry.entryUrl === null) {
    return;
  }

  const url = entry.entryUrl;

  // Subresource-integrity verification when integrity hash is present.
  if (entry.integrity) {
    await verifyIntegrity(worldId, url, entry.integrity);
  }

  // Lazy-import the bundle. Side-effects (registerSlot calls) happen here.
  try {
    await import(/* @vite-ignore */ url);
  } catch (err) {
    throw new WorldLoadError(
      worldId,
      `Failed to eval world bundle "${url}"`,
      err
    );
  }
}

// ─── Integrity verification ───────────────────────────────────────────────────

/**
 * Fetch the bundle as bytes and verify its SHA-384 hash against the provided
 * integrity string (format: "sha384-<base64>").
 *
 * @throws WorldLoadError on fetch error or hash mismatch.
 */
async function verifyIntegrity(
  worldId: string,
  url: string,
  integrity: string
): Promise<void> {
  const [algorithm, expectedB64] = integrity.split("-", 2);
  if (algorithm !== "sha384") {
    throw new WorldLoadError(
      worldId,
      `Unsupported integrity algorithm "${algorithm}"; expected sha384`
    );
  }

  let buffer: ArrayBuffer;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new WorldLoadError(
        worldId,
        `HTTP ${response.status} fetching bundle for integrity check: ${url}`
      );
    }
    buffer = await response.arrayBuffer();
  } catch (err) {
    if (err instanceof WorldLoadError) throw err;
    throw new WorldLoadError(worldId, `Network error fetching bundle for integrity check`, err);
  }

  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest("SHA-384", buffer);
  } catch (err) {
    throw new WorldLoadError(worldId, `crypto.subtle.digest failed`, err);
  }

  const actualB64 = btoa(String.fromCharCode(...new Uint8Array(digest)));

  if (actualB64 !== expectedB64) {
    throw new WorldLoadError(
      worldId,
      `Integrity mismatch for "${url}": expected ${expectedB64}, got ${actualB64}`
    );
  }
}
