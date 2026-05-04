import { h } from "preact";
import type { ComponentChildren, VNode } from "preact";
import { cn } from "../utils.js";

interface BackdropProps {
  class?: string;
  src?: string;
  fallbackColor?: string;
  children?: ComponentChildren;
}

export function Backdrop({ class: cls, src, fallbackColor = "var(--background, #14100c)", children }: BackdropProps): VNode {
  return (
    <div
      class={cn("parley-backdrop", cls)}
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100%",
        background: src ? "none" : fallbackColor,
        backgroundColor: src ? undefined : fallbackColor
      }}
    >
      {src && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 0
          }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
