import { h } from "preact";
import type { VNode } from "preact";
import { cn } from "../utils.js";

interface ChoiceListProps {
  class?: string;
  choices: string[];
  onSelect: (choice: string) => void;
  disabled?: boolean;
}

export function ChoiceList({ class: cls, choices, onSelect, disabled }: ChoiceListProps): VNode {
  return (
    <ul
      class={cn("parley-choice-list", cls)}
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gap: "10px"
      }}
    >
      {choices.map((choice) => (
        <li key={choice}>
          <button
            type="button"
            class="parley-choice-button"
            disabled={disabled}
            onClick={() => onSelect(choice)}
            style={{
              display: "block",
              width: "100%",
              minHeight: "44px",
              border: "1px solid var(--border, #5b452e)",
              background: "var(--surface, #18120d)",
              color: disabled ? "var(--muted, #bba98f)" : "var(--text, #f3eadb)",
              padding: "12px",
              lineHeight: 1.35,
              textAlign: "left",
              cursor: disabled ? "wait" : "pointer",
              opacity: disabled ? 0.65 : 1,
              font: "inherit"
            }}
          >
            {choice}
          </button>
        </li>
      ))}
    </ul>
  );
}
