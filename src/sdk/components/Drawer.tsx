import { h } from "preact";
import type { ComponentChildren, VNode } from "preact";
import { cn } from "../utils.js";

interface DrawerProps {
  class?: string;
  open: boolean;
  onClose: () => void;
  children?: ComponentChildren;
  side?: "right" | "left";
}

export function Drawer({ class: cls, open, onClose, children, side = "right" }: DrawerProps): VNode | null {
  if (!open) {
    return null;
  }

  const sideStyle = side === "right"
    ? { right: 0, left: "auto", borderLeft: "1px solid var(--border, #5b452e)" }
    : { left: 0, right: "auto", borderRight: "1px solid var(--border, #5b452e)" };

  return (
    <div
      class={cn("parley-drawer-overlay", cls)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        class="parley-drawer"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: "320px",
          background: "var(--panel, #211912)",
          padding: "24px",
          overflowY: "auto",
          ...sideStyle
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
