/**
 * RecencyRail.tsx — "Continue playing" vertical list on L1.
 *
 * Shows recent in_progress story instances across all worlds, sorted by
 * lastPlayedAt descending. Clicking an item invokes onSelect.
 */

import { h } from "preact";
import type { VNode } from "preact";
import { timeAgo } from "../../sdk/utils.js";

export interface RecencyItem {
  worldId: string;
  instanceId: string;
  storyId: string;
  worldName: string;
  storyId_label?: string; // display label for the story (falls back to storyId)
  lastPlayedAt: string | null;
  turnCount: number;
}

interface RecencyRailProps {
  items: RecencyItem[];
  onSelect: (item: RecencyItem) => void;
}

export function RecencyRail({ items, onSelect }: RecencyRailProps): VNode {
  if (items.length === 0) {
    return (
      <div class="recency-rail-empty">
        No recent stories. Pick a world above to start playing.
      </div>
    );
  }

  return (
    <ul class="recency-rail" role="list">
      {items.map((item) => (
        <li key={`${item.worldId}/${item.instanceId}/${item.storyId}`}>
          <button
            class="recency-rail-item"
            type="button"
            onClick={() => onSelect(item)}
          >
            <span class="recency-rail-world">{item.worldName}</span>
            <span class="recency-rail-story">
              {item.storyId_label ?? item.storyId}
            </span>
            <span class="recency-rail-meta">
              {item.turnCount} turn{item.turnCount !== 1 ? "s" : ""}
              {item.lastPlayedAt
                ? ` · ${timeAgo(item.lastPlayedAt)}`
                : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
