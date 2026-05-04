import { h, render } from "preact";
import * as sdk from "@parley/sdk";
import { SinglePageApp } from "./SinglePageApp.js";

// Expose the SDK globally so future world bundles can resolve @parley/sdk
// against the shell's already-loaded module instance at runtime.
(window as unknown as Record<string, unknown>).__PARLEY_SDK__ = sdk;
(window as unknown as Record<string, unknown>).__PARLEY_PLUGINS__ = {
  register: sdk.registerSlot,
  registerSlot: sdk.registerSlot
};

const appRoot = document.getElementById("app");
if (appRoot) {
  render(h(SinglePageApp, {}), appRoot);
}
