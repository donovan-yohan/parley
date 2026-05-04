import { h } from "preact";
import type { ComponentChildren, VNode } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { cn } from "../utils.js";

interface DrawerProps {
  class?: string;
  open: boolean;
  onClose: () => void;
  children?: ComponentChildren;
  side?: "right" | "left";
  /** Accessible label for screen readers — required for proper dialog semantics. */
  ariaLabel?: string;
  /** Id of the heading element inside the drawer; preferred over ariaLabel when present. */
  ariaLabelledby?: string;
}

export function Drawer({
  class: cls,
  open,
  onClose,
  children,
  side = "right",
  ariaLabel,
  ariaLabelledby
}: DrawerProps): VNode | null {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Focus management: when the drawer opens, remember the trigger, move focus
  // into the drawer, and restore focus when it closes. Also wire up Escape +
  // a basic focus trap so keyboard users can't tab out into the page behind.
  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    if (drawer) {
      const focusables = drawer.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
      (focusables[0] ?? drawer).focus();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawer) {
        return;
      }
      const focusables = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      );
      if (focusables.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

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
        ref={drawerRef}
        class="parley-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledby ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledby}
        tabIndex={-1}
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
