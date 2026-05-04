import { h, render } from "preact";
import * as sdk from "@parley/sdk";
import { SinglePageApp } from "./SinglePageApp.js";
import { loadWorldManifest } from "../worlds-loader/index.js";

// Expose the SDK globally so future world bundles can resolve @parley/sdk
// against the shell's already-loaded module instance at runtime.
(window as unknown as Record<string, unknown>).__PARLEY_SDK__ = sdk;
(window as unknown as Record<string, unknown>).__PARLEY_PLUGINS__ = {
  register: sdk.registerSlot,
  registerSlot: sdk.registerSlot
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

const appRoot = document.getElementById("app");
if (appRoot) {
  render(h(SinglePageApp, {}), appRoot);
}
