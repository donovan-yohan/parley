import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

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
      output: {
        entryFileNames: "assets/shell-[hash].js",
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
