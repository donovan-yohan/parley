import type { VNode } from "preact";

export interface CustomShellHandlers {
  renderWorldHome: (props: { worldId: string; instanceId: string }) => VNode;
  renderStoryPlay: (props: { worldId: string; instanceId: string; storyId: string }) => VNode;
}

export const customShellRegistry: Map<string, CustomShellHandlers>;
export const subscribers: Set<() => void>;

export function notifySubscribers(): void;
export function registerCustomShell(worldId: string, handlers: CustomShellHandlers): void;
export function getCustomShell(worldId: string): CustomShellHandlers | null;
export function __resetRegistryForTests(): void;
