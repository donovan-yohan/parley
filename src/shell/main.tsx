import { h, render } from "preact";
import type { VNode } from "preact";
import * as sdk from "@parley/sdk";
import "./styles/screens.css";
import { loadWorldManifest } from "../worlds-loader/index.js";
import { useRoute } from "./router.js";
import type { Route } from "./router.js";
import { Landing } from "./pages/Landing.js";
import { WorldHome } from "./pages/WorldHome.js";
import { StoryPlay } from "./pages/StoryPlay.js";
import { getCustomShell, useCustomShellRegistry } from "@parley/sdk";

// Expose the SDK globally so future world bundles can resolve @parley/sdk
// against the shell's already-loaded module instance at runtime.
(window as unknown as Record<string, unknown>).__PARLEY_SDK__ = sdk;
(window as unknown as Record<string, unknown>).__PARLEY_PLUGINS__ = {
  register: sdk.registerSlot,
  registerSlot: sdk.registerSlot,
  registerCustomShell: sdk.registerCustomShell,
};

// Fire-and-forget: fetch the world manifest at boot and stash on window.
// This is non-blocking; the shell renders immediately while the fetch runs.
loadWorldManifest()
  .then((manifest) => {
    (window as unknown as Record<string, unknown>).__PARLEY_WORLD_MANIFEST__ = manifest;
  })
  .catch((err) => {
    console.error("[Parley] Failed to load world manifest:", err);
  });

function App(): VNode {
  const route: Route = useRoute();

  // Subscribe to custom shell registry changes so late-registering custom
  // shells (loaded after route navigation) trigger a re-render.
  useCustomShellRegistry();

  switch (route.kind) {
    case "worldHome": {
      const customShell = getCustomShell(route.worldId);
      if (customShell) {
        return customShell.renderWorldHome({
          worldId: route.worldId,
          instanceId: route.instanceId,
        }) as VNode;
      }
      return (
        <WorldHome
          worldId={route.worldId}
          instanceId={route.instanceId}
        />
      );
    }
    case "storyPlay": {
      const customShell = getCustomShell(route.worldId);
      if (customShell) {
        return customShell.renderStoryPlay({
          worldId: route.worldId,
          instanceId: route.instanceId,
          storyId: route.storyId,
        }) as VNode;
      }
      return (
        <StoryPlay
          worldId={route.worldId}
          instanceId={route.instanceId}
          storyId={route.storyId}
        />
      );
    }
    case "landing":
    default:
      // L1 is never overridable — always render the default Landing.
      return <Landing />;
  }
}

const appRoot = document.getElementById("app");
if (appRoot) {
  render(h(App, {}), appRoot);
}
