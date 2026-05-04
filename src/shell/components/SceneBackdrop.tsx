/**
 * SceneBackdrop.tsx — slot consumer for the "scene-backdrop" slot.
 *
 * If a world has registered a custom component for this slot via
 * registerSlot(worldId, 'scene-backdrop', MyComponent), that component
 * is rendered instead. Otherwise, falls back to the SDK's <Backdrop>
 * with the --world-asset-bg CSS variable as the image source.
 */

import { h } from "preact";
import type { VNode, ComponentChildren } from "preact";
import { Backdrop } from "../../sdk/components/Backdrop.js";
import { useSlot } from "../../sdk/slots.js";
import type { SlotContext } from "../../sdk/slots.js";

interface SceneBackdropProps extends SlotContext {
  children?: ComponentChildren;
  class?: string;
}

/**
 * Reads the "scene-backdrop" slot for the given world. If a world has
 * registered a custom backdrop component, renders that. Otherwise renders
 * <Backdrop src=var(--world-asset-bg)> falling back to var(--color-background).
 */
export function SceneBackdrop({
  worldId,
  instanceId,
  storyId,
  children,
  class: cls,
}: SceneBackdropProps): VNode {
  const context: SlotContext = { worldId, instanceId, storyId };
  const CustomBackdrop = useSlot("scene-backdrop", context);

  if (CustomBackdrop) {
    return h(
      CustomBackdrop as (props: Record<string, unknown>) => VNode | null,
      { worldId, instanceId, storyId, class: cls } as Record<string, unknown>
    ) as VNode;
  }

  // Default: read the CSS custom property set by applyTheme for the bg asset.
  // The image src is resolved by the browser at render time; if the var is
  // unset (no bg asset for this world), Backdrop falls back to fallbackColor.
  return (
    <Backdrop
      class={cls}
      src={getCSSVar("--world-asset-bg") ?? undefined}
      fallbackColor="var(--color-background, #0f0f0f)"
    >
      {children}
    </Backdrop>
  );
}

/**
 * Read a CSS custom property from the document root.
 * Returns the trimmed value, or null if unset / empty.
 */
function getCSSVar(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || null;
}
