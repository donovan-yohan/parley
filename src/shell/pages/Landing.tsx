/**
 * Landing.tsx — L1 landing page (neutral Parley chrome).
 *
 * Renders a 3-col world tile grid + "Continue playing" recency rail.
 * On mount: clearTheme() so L1 always shows neutral Parley chrome.
 */

import { h } from "preact";
import type { VNode } from "preact";
import { useState, useEffect } from "preact/hooks";
import { getStories, createInstance, getInstances, sortByLastPlayedDesc } from "../../sdk/api.js";
import type { WorldSummary } from "../../sdk/api.js";
import { navigate } from "../router.js";
import {
  useStore,
  loadWorlds,
  clearTheme,
  selectWorlds,
  selectWorldsLoaded,
  selectWorldsError,
  resetWorlds,
} from "../state/worldStore.js";
import { RecencyRail } from "../components/RecencyRail.js";
import type { RecencyItem } from "../components/RecencyRail.js";

export function Landing(): VNode {
  const worlds = useStore(selectWorlds);
  const worldsLoaded = useStore(selectWorldsLoaded);
  const worldsError = useStore(selectWorldsError);
  const [recencyItems, setRecencyItems] = useState<RecencyItem[]>([]);

  // Clear world theme on mount (L1 is neutral chrome)
  useEffect(() => {
    clearTheme();
    loadWorlds();
  }, []);

  // Build recency rail once worlds are loaded
  useEffect(() => {
    if (!worldsLoaded || worlds.length === 0) return;
    buildRecencyRail(worlds).then(setRecencyItems).catch(() => {});
  }, [worlds, worldsLoaded]);

  async function buildRecencyRail(worldList: WorldSummary[]): Promise<RecencyItem[]> {
    const items: RecencyItem[] = [];
    for (const world of worldList) {
      try {
        const instances = await getInstances(world.id);
        for (const inst of instances) {
          const { instances: stories } = await getStories(world.id, inst.instanceId);
          for (const story of stories) {
            if (story.status === "in_progress") {
              items.push({
                worldId: world.id,
                instanceId: inst.instanceId,
                storyId: story.storyId,
                worldName: world.name,
                lastPlayedAt: story.lastPlayedAt ?? inst.lastPlayedAt,
                turnCount: story.turnCount,
              });
            }
          }
        }
      } catch {
        // Skip worlds that fail to load instances/stories
      }
    }
    return sortByLastPlayedDesc(items).slice(0, 8);
  }

  async function handleWorldClick(world: WorldSummary) {
    try {
      const instances = await getInstances(world.id);
      if (instances.length > 0) {
        const mostRecent = sortByLastPlayedDesc(instances)[0];
        navigate(
          `/world/${encodeURIComponent(world.id)}/${encodeURIComponent(mostRecent.instanceId)}`
        );
      } else {
        const newInstance = await createInstance(world.id);
        navigate(
          `/world/${encodeURIComponent(world.id)}/${encodeURIComponent(newInstance.instanceId)}`
        );
      }
    } catch (err) {
      console.error("[Parley] handleWorldClick failed:", err);
    }
  }

  function handleRecencySelect(item: RecencyItem) {
    navigate(
      `/world/${encodeURIComponent(item.worldId)}/${encodeURIComponent(item.instanceId)}/story/${encodeURIComponent(item.storyId)}`
    );
  }

  return (
    <div class="l1-landing">
      <header class="l1-header">
        <h1>Parley</h1>
        <p>Your worlds, your stories.</p>
      </header>

      <div class="l1-body">
        {/* Error banner */}
        {worldsError && (
          <div class="l1-banner error" role="alert">
            <span>Could not load your worlds. {worldsError}</span>
            <button
              type="button"
              onClick={() => {
                resetWorlds();
                loadWorlds();
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* World tile grid */}
        <section aria-label="Installed worlds">
          <h2 class="l1-section-heading">Your Worlds</h2>

          {!worldsLoaded ? (
            // Loading skeleton
            <div class="l1-world-grid" aria-busy="true">
              {[1, 2, 3].map((n) => (
                <div key={n} class="world-tile-skeleton skeleton" />
              ))}
            </div>
          ) : worlds.length === 0 && !worldsError ? (
            // Empty state
            <div class="l1-banner empty" role="status">
              <span>No worlds installed yet.</span>
              <span>
                Drop a world directory into{" "}
                <code>worlds/&lt;world-id&gt;/</code> and refresh.
              </span>
              <button
                type="button"
                onClick={() => {
                  resetWorlds();
                  loadWorlds();
                }}
              >
                Reload
              </button>
            </div>
          ) : (
            <div class="l1-world-grid">
              {worlds.map((world) => (
                <WorldTile
                  key={world.id}
                  world={world}
                  onClick={() => handleWorldClick(world)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recency rail */}
        {worldsLoaded && recencyItems.length > 0 && (
          <section aria-label="Continue playing">
            <h2 class="l1-section-heading">Continue Playing</h2>
            <RecencyRail items={recencyItems} onSelect={handleRecencySelect} />
          </section>
        )}
      </div>
    </div>
  );
}

interface WorldTileProps {
  world: WorldSummary;
  onClick: () => void;
}

function WorldTile({ world, onClick }: WorldTileProps): VNode {
  return (
    <article class="world-tile" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }} aria-label={`Play ${world.name}`}>
      {world.cover ? (
        <img
          class="world-tile-cover"
          src={`/world-assets/${world.cover}?scenario=${encodeURIComponent(world.id)}`}
          alt={`${world.name} cover`}
          loading="lazy"
        />
      ) : (
        <div class="world-tile-cover-placeholder" aria-hidden="true">
          {world.name.charAt(0)}
        </div>
      )}
      <div class="world-tile-info">
        <h3 class="world-tile-name">{world.name}</h3>
        <p class="world-tile-premise">{world.premise}</p>
      </div>
    </article>
  );
}
