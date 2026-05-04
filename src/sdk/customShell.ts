import type { VNode } from "preact";
import { useState, useEffect } from "preact/hooks";

// Registry layer delegated to a plain-JS module so that Node --test suites
// can import the registry without needing tsx or a Preact renderer.
import {
  customShellRegistry,
  subscribers,
  registerCustomShell as _registerCustomShell,
  getCustomShell as _getCustomShell,
} from "./customShell-registry.js";

export interface CustomShellHandlers {
  renderWorldHome: (props: { worldId: string; instanceId: string }) => VNode;
  renderStoryPlay: (props: { worldId: string; instanceId: string; storyId: string }) => VNode;
}

/**
 * Register a full custom shell for a specific world (L2 + L3 render override).
 * Calling again with the same worldId replaces the previous handlers (last-write-wins).
 * Notifies subscribers so the shell re-renders if registration happens after route change.
 */
export function registerCustomShell(worldId: string, handlers: CustomShellHandlers): void {
  _registerCustomShell(worldId, handlers as Parameters<typeof _registerCustomShell>[1]);
}

/**
 * Look up registered custom shell handlers for a worldId, or return null.
 */
export function getCustomShell(worldId: string): CustomShellHandlers | null {
  return _getCustomShell(worldId) as CustomShellHandlers | null;
}

/**
 * Hook: returns true and triggers re-renders when the custom shell registry changes.
 * Used by the shell's <App> to subscribe to late-registering custom shells.
 */
export function useCustomShellRegistry(): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    const notify = () => setTick((n) => n + 1);
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
    };
  }, []);
}

export { customShellRegistry, subscribers };
