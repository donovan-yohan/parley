import { h, render } from "preact";
import type { VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import * as sdk from "@parley/sdk";
import "./styles/screens.css";
import { loadWorldManifest, loadWorldBundle } from "../worlds-loader/index.js";
import type { WorldManifest } from "../contracts/worldManifest.js";
import { useRoute, navigate } from "./router.js";
import type { Route } from "./router.js";
import { Landing } from "./pages/Landing.js";
import { WorldHome } from "./pages/WorldHome.js";
import { StoryPlay } from "./pages/StoryPlay.js";
import { applyThemeForWorld } from "./state/worldStore.js";
import { getCustomShell, useCustomShellRegistry } from "@parley/sdk";

// Expose the SDK + the hash-router navigate globally so future world bundles
// can resolve @parley/sdk against the shell's already-loaded module instance
// at runtime, and can navigate without importing shell internals.
const sdkSurface = {
  ...sdk,
  navigate,
};
(window as unknown as Record<string, unknown>).__PARLEY_SDK__ = sdkSurface;
(window as unknown as Record<string, unknown>).__PARLEY_PLUGINS__ = {
  register: sdk.registerSlot,
  registerSlot: sdk.registerSlot,
  registerCustomShell: sdk.registerCustomShell,
};

let cachedManifest: WorldManifest | null = null;
const manifestPromise: Promise<WorldManifest | null> = loadWorldManifest()
  .then((manifest) => {
    cachedManifest = manifest;
    (window as unknown as Record<string, unknown>).__PARLEY_WORLD_MANIFEST__ = manifest;
    return manifest;
  })
  .catch((err) => {
    console.error("[Parley] Failed to load world manifest:", err);
    return null;
  });

const loadedBundles = new Set<string>();

/**
 * For shell:"custom" worlds, dynamically import the world bundle the first time
 * we land on its route so its `registerCustomShell` call runs before we ask
 * the registry for a renderer. shell:"default" worlds need no bundle yet.
 */
async function ensureWorldBundle(worldId: string): Promise<void> {
  if (loadedBundles.has(worldId)) return;
  const manifest = cachedManifest ?? (await manifestPromise);
  const entry = manifest?.worlds?.[worldId];
  if (!entry) return;
  if (entry.shell !== "custom" || entry.entryUrl === null) {
    loadedBundles.add(worldId);
    return;
  }
  try {
    await loadWorldBundle(worldId, entry);
  } catch (err) {
    console.error(`[Parley] Failed to load world bundle "${worldId}":`, err);
  } finally {
    loadedBundles.add(worldId);
  }
}

function renderRoute(route: Route): VNode {
  if (route.kind === "worldHome" || route.kind === "storyPlay") {
    const customShell = getCustomShell(route.worldId);
    if (customShell) {
      if (route.kind === "worldHome") {
        return customShell.renderWorldHome({
          worldId: route.worldId,
          instanceId: route.instanceId,
        }) as VNode;
      }
      return customShell.renderStoryPlay({
        worldId: route.worldId,
        instanceId: route.instanceId,
        storyId: route.storyId,
      }) as VNode;
    }
  }

  switch (route.kind) {
    case "worldHome":
      return (
        <WorldHome
          worldId={route.worldId}
          instanceId={route.instanceId}
        />
      );
    case "storyPlay":
      return (
        <StoryPlay
          worldId={route.worldId}
          instanceId={route.instanceId}
          storyId={route.storyId}
        />
      );
    case "landing":
    default:
      // L1 is never overridable — always render the default Landing.
      return <Landing />;
  }
}

function App(): VNode {
  const route: Route = useRoute();

  // Subscribe to custom shell registry changes so a late-arriving custom
  // shell registration triggers a re-render after its bundle finishes loading.
  useCustomShellRegistry();

  // Bump on bundle load so the next render sees the freshly-registered shell.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (route.kind !== "worldHome" && route.kind !== "storyPlay") return;
    let cancelled = false;
    ensureWorldBundle(route.worldId).then(() => {
      if (!cancelled) setTick((t) => t + 1);
    });
    // Apply theme for both default and custom shells so the world's CSS
    // custom properties resolve regardless of who renders the page.
    applyThemeForWorld(route.worldId).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [route.kind, "worldId" in route ? route.worldId : null]);

  return renderRoute(route);
}

const appRoot = document.getElementById("app");
if (appRoot) {
  render(h(App, {}), appRoot);
}
