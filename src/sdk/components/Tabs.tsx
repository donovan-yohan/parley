import { h } from "preact";
import type { ComponentChildren, VNode } from "preact";
import { useState } from "preact/hooks";
import { cn } from "../utils.js";

interface TabDefinition {
  id: string;
  label: string;
  content: ComponentChildren;
}

interface TabsProps {
  class?: string;
  tabs: TabDefinition[];
  activeId?: string;
  onChange?: (id: string) => void;
}

export function Tabs({ class: cls, tabs, activeId, onChange }: TabsProps): VNode {
  const [internalActive, setInternalActive] = useState(tabs[0]?.id ?? "");
  const controlled = activeId !== undefined;
  const currentId = controlled ? activeId : internalActive;
  const currentTab = tabs.find((tab) => tab.id === currentId) ?? tabs[0];

  function handleTabClick(id: string) {
    if (!controlled) {
      setInternalActive(id);
    }
    onChange?.(id);
  }

  return (
    <div class={cn("parley-tabs", cls)}>
      <div
        class="parley-tabs-rail"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border, #5b452e)",
          gap: "2px"
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            class={cn("parley-tab", tab.id === currentId ? "parley-tab--active" : undefined)}
            onClick={() => handleTabClick(tab.id)}
            style={{
              padding: "8px 16px",
              border: "none",
              background: tab.id === currentId ? "var(--panel, #211912)" : "transparent",
              color: tab.id === currentId ? "var(--accent, #d7a85f)" : "var(--muted, #bba98f)",
              borderBottom: tab.id === currentId ? "2px solid var(--accent, #d7a85f)" : "2px solid transparent",
              cursor: "pointer",
              fontWeight: tab.id === currentId ? 700 : 400,
              font: "inherit"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div class="parley-tabs-content" style={{ padding: "16px 0" }}>
        {currentTab?.content}
      </div>
    </div>
  );
}
