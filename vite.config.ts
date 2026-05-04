import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, existsSync } from "node:fs";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

// ── Discover custom-shell world entry points ──────────────────────────────────

interface WorldJson {
  id: string;
  shell?: string;
}

/**
 * Scan worlds/ for directories that declare shell:"custom" in world.json
 * and have a shell/entry.tsx file. Returns a map of worldId → absolute path.
 */
function discoverCustomShellWorlds(): Record<string, string> {
  const worldsDir = path.join(repoRoot, "worlds");
  const entries: Record<string, string> = {};

  if (!existsSync(worldsDir)) return entries;

  for (const entry of readdirSync(worldsDir)) {
    const worldJsonPath = path.join(worldsDir, entry, "world.json");
    const entryPath = path.join(worldsDir, entry, "shell", "entry.tsx");

    if (!existsSync(worldJsonPath) || !existsSync(entryPath)) continue;

    let world: WorldJson;
    try {
      world = JSON.parse(readFileSync(worldJsonPath, "utf8")) as WorldJson;
    } catch {
      continue;
    }

    if (world.shell === "custom") {
      entries[world.id] = entryPath;
    }
  }

  return entries;
}

const customShellWorlds = discoverCustomShellWorlds();

// Build Rollup input map: shell entry + one entry per custom-shell world
const rollupInput: Record<string, string> = {
  shell: path.join(repoRoot, "src", "shell", "index.html"),
  ...Object.fromEntries(
    Object.entries(customShellWorlds).map(([worldId, entryPath]) => [
      `worlds/${worldId}/entry`,
      entryPath,
    ])
  ),
};

// ── Externals predicate for world bundles ─────────────────────────────────────
// @parley/sdk and preact must NOT be bundled into world bundles — they
// resolve to the shell's already-loaded module instance at runtime via
// __PARLEY_SDK__ globals.

function isWorldBundleExternal(id: string, importer: string | undefined): boolean {
  if (!importer) return false;
  // Only apply to imports originating inside a world bundle
  const isFromWorldBundle = importer.includes(`${path.sep}worlds${path.sep}`);
  if (!isFromWorldBundle) return false;
  return (
    id === "@parley/sdk" ||
    id === "preact" ||
    id.startsWith("preact/")
  );
}

export default defineConfig({
  plugins: [preact()],
  root: path.join(repoRoot, "src", "shell"),
  resolve: {
    alias: {
      "@parley/sdk": path.resolve(repoRoot, "src/sdk/index.ts")
    }
  },
  build: {
    outDir: path.resolve(repoRoot, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: rollupInput,
      external: isWorldBundleExternal,
      output: {
        entryFileNames: (chunk) => {
          // World bundle entries → dist/worlds/<worldId>/entry-[hash].js
          if (chunk.name.startsWith("worlds/")) {
            const worldId = chunk.name.replace(/^worlds\//, "").replace(/\/entry$/, "");
            return `worlds/${worldId}/entry-[hash].js`;
          }
          // Shell entry → assets/shell-[hash].js
          return "assets/shell-[hash].js";
        },
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/world-assets": "http://127.0.0.1:4173"
    }
  }
});
