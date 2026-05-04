/**
 * discover-worlds.ts — build-time script.
 *
 * Scans worlds/{world-id}/world.json, validates each via ParleyWorldSchema, then emits
 * dist/world-manifest.json matching the parley-world-manifest/v1 schema.
 *
 * Run via: node --import tsx scripts/discover-worlds.ts
 * Also called from the npm postbuild hook in package.json.
 *
 * For shell:"custom" worlds, this script resolves the hashed entry URL
 * emitted by the Vite build from dist/worlds/<worldId>/entry-*.js.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ParleyWorldSchema } from "../src/contracts/world.ts";
import type { WorldManifest } from "../src/contracts/worldManifest.ts";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const worldsDir = path.join(repoRoot, "worlds");
const distDir = path.join(repoRoot, "dist");
const outPath = path.join(distDir, "world-manifest.json");

// ─── Resolve hashed entry URL for a custom-shell world ────────────────────────

/**
 * Looks in dist/worlds/<worldId>/ for a file matching entry-*.js.
 * Returns a relative URL string (e.g. "worlds/night-city-after-curfew/entry-abc123.js")
 * or null if no matching file is found.
 */
function resolveCustomShellEntryUrl(worldId: string): string | null {
  const worldDistDir = path.join(distDir, "worlds", worldId);
  if (!existsSync(worldDistDir)) return null;

  let files: string[];
  try {
    files = readdirSync(worldDistDir);
  } catch {
    return null;
  }

  const entryFile = files.find((f) => /^entry-[^.]+\.js$/.test(f));
  if (!entryFile) return null;

  // Return as a relative URL from the dist root (served at /<url>).
  return `worlds/${worldId}/${entryFile}`;
}

// ─── Discover worlds ──────────────────────────────────────────────────────────

function discoverWorlds(): WorldManifest["worlds"] {
  const result: WorldManifest["worlds"] = {};

  let entries: string[];
  try {
    entries = readdirSync(worldsDir);
  } catch {
    console.warn("[discover-worlds] worlds/ directory not found; emitting empty manifest.");
    return result;
  }

  for (const entry of entries) {
    const worldDir = path.join(worldsDir, entry);
    const worldJsonPath = path.join(worldDir, "world.json");

    if (!existsSync(worldJsonPath)) {
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(worldJsonPath, "utf8"));
    } catch (err) {
      console.warn(`[discover-worlds] Skipping ${entry}: failed to parse world.json:`, err);
      continue;
    }

    let world;
    try {
      world = ParleyWorldSchema.parse(raw);
    } catch (err) {
      console.warn(`[discover-worlds] Skipping ${entry}: world.json failed validation:`, err);
      continue;
    }

    // For shell:"custom" worlds, resolve the hashed entry URL from dist/.
    // For shell:"default" worlds, entryUrl remains null (theme-only).
    let entryUrl: string | null = null;
    if (world.shell === "custom") {
      entryUrl = resolveCustomShellEntryUrl(world.id);
      if (!entryUrl) {
        console.warn(
          `[discover-worlds] Warning: ${world.id} declares shell:"custom" but no dist/worlds/${world.id}/entry-*.js was found. entryUrl will be null.`
        );
      }
    }

    result[world.id] = {
      shell: world.shell,
      entryUrl,
    };
  }

  return result;
}

// ─── Emit ─────────────────────────────────────────────────────────────────────

const worlds = discoverWorlds();

const manifest: WorldManifest = {
  schema_version: "parley-world-manifest/v1",
  worlds,
};

// Ensure dist/ exists (created by Vite build; may not exist in standalone runs).
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

const worldIds = Object.keys(worlds);
console.log(
  `[discover-worlds] Emitted ${outPath} with ${worldIds.length} world(s): ${worldIds.join(", ")}`
);
