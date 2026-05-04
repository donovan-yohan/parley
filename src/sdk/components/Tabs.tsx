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
  /**
   * Stable identifier used to scope tab/panel ids and aria-controls links.
   * Required when the Tabs component might appear more than once on a page.
   */
  idPrefix?: string;
  /** Accessible label for the tablist when no visual heading is associated. */
  ariaLabel?: string;
}

export function Tabs({ class: cls, tabs, activeId, onChange, idPrefix = "parley-tabs", ariaLabel }: TabsProps): VNode {
  const [internalActive, setInternalActive] = useState(tabs[0]?.id ?? "");
  const controlled = activeId !== undefined;
  const currentId = controlled ? activeId : internalActive;
  const currentTab = tabs.find((tab) => tab.id === currentId) ?? tabs[0];

  function tabButtonId(id: string) {
    return `${idPrefix}-tab-${id}`;
  }
  function tabPanelId(id: string) {
    return `${idPrefix}-panel-${id}`;
  }

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
        role="tablist"
        aria-label={ariaLabel}
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border, #5b452e)",
          gap: "2px"
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === currentId;
          return (
            <button
              key={tab.id}
              id={tabButtonId(tab.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={tabPanelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              class={cn("parley-tab", selected ? "parley-tab--active" : undefined)}
              onClick={() => handleTabClick(tab.id)}
              style={{
                padding: "8px 16px",
                border: "none",
                background: selected ? "var(--panel, #211912)" : "transparent",
                color: selected ? "var(--accent, #d7a85f)" : "var(--muted, #bba98f)",
                borderBottom: selected ? "2px solid var(--accent, #d7a85f)" : "2px solid transparent",
                cursor: "pointer",
                fontWeight: selected ? 700 : 400,
                font: "inherit"
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {currentTab && (
        <div
          class="parley-tabs-content"
          role="tabpanel"
          id={tabPanelId(currentTab.id)}
          aria-labelledby={tabButtonId(currentTab.id)}
          tabIndex={0}
          style={{ padding: "16px 0" }}
        >
          {currentTab.content}
        </div>
      )}
    </div>
  );
}
