import { h } from "preact";
import type { VNode } from "preact";
import { useState, useEffect } from "preact/hooks";

export type SlotName =
  | "scene-backdrop"
  | "dialogue-frame"
  | "header-crest"
  | "header-tagline"
  | "sidebar-rail"
  | "inventory-rail"
  | "footer-tagline";

export interface SlotContext {
  worldId: string;
  instanceId: string;
  storyId?: string;
}

type SlotComponent = (props: SlotContext & Record<string, unknown>) => VNode | null;

/**
 * Registry: worldId → (slotName → component).
 * Last-write-wins for duplicate registration.
 */
const slotRegistry = new Map<string, Map<SlotName, SlotComponent>>();

/**
 * Module-level subscriber list for useSlot re-renders on late registration.
 */
const subscribers = new Set<() => void>();

function notifySubscribers() {
  for (const fn of subscribers) {
    fn();
  }
}

/**
 * Register a component into a named slot for a specific world.
 * Calling again with the same (worldId, slot) replaces the previous component.
 */
export function registerSlot(worldId: string, slot: SlotName, component: SlotComponent): void {
  if (!slotRegistry.has(worldId)) {
    slotRegistry.set(worldId, new Map());
  }
  slotRegistry.get(worldId)!.set(slot, component);
  notifySubscribers();
}

/**
 * Hook: returns the registered SlotComponent for (slot, context.worldId), or null.
 * Re-renders when any slot registration changes.
 */
export function useSlot(slot: SlotName, context: SlotContext): SlotComponent | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    const notify = () => setTick((n) => n + 1);
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
    };
  }, []);

  return slotRegistry.get(context.worldId)?.get(slot) ?? null;
}

interface PluginSlotProps {
  slot: SlotName;
  context: SlotContext;
  fallback?: SlotComponent;
}

/**
 * Renders the registered slot component for the given context, or the fallback, or null.
 */
export function PluginSlot({ slot, context, fallback }: PluginSlotProps): VNode | null {
  const Component = useSlot(slot, context) ?? fallback ?? null;
  if (!Component) {
    return null;
  }
  const props = context as SlotContext & Record<string, unknown>;
  // Cast through unknown to satisfy the VNode<{}> return constraint while
  // keeping the full SlotContext available to the component at runtime.
  return h(Component as (props: Record<string, unknown>) => VNode | null, props) as VNode;
}
