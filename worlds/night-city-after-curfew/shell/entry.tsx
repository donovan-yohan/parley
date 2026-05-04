/**
 * Night City After Curfew — Custom Shell Bundle Entry
 *
 * This file is the Rollup/Vite entry point for the world bundle.
 * The build emits dist/worlds/night-city-after-curfew/entry-[hash].js.
 * The shell's worlds-loader lazy-imports this file at runtime when the
 * player navigates to this world, triggering registerCustomShell.
 *
 * @parley/sdk and preact are declared as external — they resolve to the
 * shell's already-loaded module instance at runtime via __PARLEY_SDK__.
 */

import { h, registerCustomShell } from "@parley/sdk";
import { renderWorldHome } from "./pages/WorldHome.js";
import { renderStoryPlay } from "./pages/StoryPlay.js";

const WORLD_ID = "night-city-after-curfew";

registerCustomShell(WORLD_ID, {
  renderWorldHome: (props: { worldId: string; instanceId: string }) =>
    renderWorldHome(props),
  renderStoryPlay: (props: { worldId: string; instanceId: string; storyId: string }) =>
    renderStoryPlay(props),
});
