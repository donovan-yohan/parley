import { h } from "preact";
import type { ComponentChildren, VNode } from "preact";
import { cn } from "../utils.js";

type ButtonVariant = "primary" | "ghost" | "destructive";

interface ButtonProps {
  class?: string;
  variant?: ButtonVariant;
  onClick?: (event: MouseEvent) => void;
  disabled?: boolean;
  children?: ComponentChildren;
  type?: "button" | "submit" | "reset";
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "border: 1px solid var(--accent, #d7a85f);",
    "background: var(--accent, #d7a85f);",
    "color: var(--button-text, #1a1209);"
  ].join(" "),
  ghost: [
    "border: 1px solid var(--border, #5b452e);",
    "background: transparent;",
    "color: var(--text, #f3eadb);"
  ].join(" "),
  destructive: [
    "border: 1px solid var(--danger, #cf7f68);",
    "background: var(--danger, #cf7f68);",
    "color: var(--button-text, #1a1209);"
  ].join(" ")
};

export function Button({
  class: cls,
  variant = "primary",
  onClick,
  disabled,
  children,
  type = "button"
}: ButtonProps): VNode {
  return (
    <button
      type={type}
      class={cn("parley-button", `parley-button--${variant}`, cls)}
      onClick={onClick}
      disabled={disabled}
      style={`
        min-height: 40px;
        padding: 0 16px;
        font-weight: 700;
        cursor: ${disabled ? "wait" : "pointer"};
        opacity: ${disabled ? 0.65 : 1};
        font: inherit;
        ${variantStyles[variant]}
      `}
    >
      {children}
    </button>
  );
}
