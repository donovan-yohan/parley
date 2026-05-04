/**
 * DialogueFrame.tsx — slot consumer for the "dialogue-frame" slot.
 *
 * If a world has registered a custom component for this slot, that component
 * renders instead. Otherwise, falls back to a semi-translucent panel that
 * reads --component-dialogue-frame-* CSS variables emitted by applyTheme.
 *
 * CSS contract (defaults in parens):
 *   --component-dialogue-frame-background      (rgba(0,0,0,0.6))
 *   --component-dialogue-frame-border-color    (rgba(255,255,255,0.1))
 *   --component-dialogue-frame-backdrop-filter (none)
 *   --component-dialogue-frame-border-radius   (var(--radius, 0.5rem))
 */

import { h } from "preact";
import type { VNode, ComponentChildren } from "preact";
import { useSlot } from "../../sdk/slots.js";
import type { SlotContext } from "../../sdk/slots.js";

interface DialogueFrameProps extends SlotContext {
  children?: ComponentChildren;
  class?: string;
}

/**
 * Renders the "dialogue-frame" slot component if registered, or the default
 * semi-translucent panel consuming --component-dialogue-frame-* CSS vars.
 */
export function DialogueFrame({
  worldId,
  instanceId,
  storyId,
  children,
  class: cls,
}: DialogueFrameProps): VNode {
  const context: SlotContext = { worldId, instanceId, storyId };
  const CustomFrame = useSlot("dialogue-frame", context);

  if (CustomFrame) {
    return h(
      CustomFrame as (props: Record<string, unknown>) => VNode | null,
      { worldId, instanceId, storyId, class: cls } as Record<string, unknown>
    ) as VNode;
  }

  // Default: semi-translucent panel reading componentStyles CSS vars.
  const classes = ["dialogue-frame", cls].filter(Boolean).join(" ");
  return (
    <div
      class={classes}
      style={{
        background:
          "var(--component-dialogue-frame-background, rgba(0,0,0,0.6))",
        border:
          "1px solid var(--component-dialogue-frame-border-color, rgba(255,255,255,0.1))",
        backdropFilter:
          "var(--component-dialogue-frame-backdrop-filter, none)",
        borderRadius:
          "var(--component-dialogue-frame-border-radius, var(--radius, 0.5rem))",
        padding: "1rem",
      }}
    >
      {children}
    </div>
  );
}
