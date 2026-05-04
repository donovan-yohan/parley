import { h, Fragment } from "preact";
import type { ComponentChildren, VNode } from "preact";
import { cn } from "../utils.js";

interface CardProps {
  class?: string;
  header?: ComponentChildren;
  children?: ComponentChildren;
}

export function Card({ class: cls, header, children }: CardProps): VNode {
  return (
    <div
      class={cn("parley-card", cls)}
      style={{
        border: "1px solid var(--border, #5b452e)",
        background: "var(--panel, #211912)",
        borderRadius: "2px",
        overflow: "hidden"
      }}
    >
      {header && (
        <div
          class="parley-card-header"
          style={{
            borderBottom: "1px solid var(--border, #5b452e)",
            padding: "12px 16px",
            fontWeight: 700
          }}
        >
          {header}
        </div>
      )}
      <div class="parley-card-body" style={{ padding: "16px" }}>
        {children}
      </div>
    </div>
  );
}
