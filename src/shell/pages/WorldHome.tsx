/**
 * WorldHome.tsx — L2 World Instance Homebase (world-skinned).
 *
 * Shows the story list for a world instance. Applies world theme on mount.
 * Supports creating new story instances from templates and navigating to L3.
 */

import { h } from "preact";
import type { VNode } from "preact";
import { useState, useEffect } from "preact/hooks";
import { getStories, createStory, getInstances } from "../../sdk/api.js";
import type { StorySummary, InstanceSummary } from "../../sdk/api.js";
import { navigate } from "../router.js";
import { applyThemeForWorld } from "../state/worldStore.js";
import { InstanceSwitcher } from "../components/InstanceSwitcher.js";
import { timeAgo } from "../../sdk/utils.js";

interface WorldHomeProps {
  worldId: string;
  instanceId: string;
}

interface StoryGroup {
  templateId: string;
  instances: StorySummary[];
}

export function WorldHome({ worldId, instanceId }: WorldHomeProps): VNode {
  const [templates, setTemplates] = useState<string[]>([]);
  const [storyInstances, setStoryInstances] = useState<StorySummary[]>([]);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [worldName, setWorldName] = useState<string>(worldId);
  const [worldTone, setWorldTone] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applyThemeForWorld(worldId).catch(() => {});
  }, [worldId]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      loadStoriesData(),
      loadWorldMeta(),
      getInstances(worldId).then(setInstances),
    ])
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load stories.");
      })
      .finally(() => setLoading(false));
  }, [worldId, instanceId]);

  async function loadStoriesData() {
    const data = await getStories(worldId, instanceId);
    setTemplates(data.templates);
    setStoryInstances(data.instances);
  }

  async function loadWorldMeta() {
    try {
      const response = await fetch("/api/worlds");
      if (response.ok) {
        const data = await response.json() as { worlds: Array<{ id: string; name: string; tone: string }> };
        const world = data.worlds.find((w) => w.id === worldId);
        if (world) {
          setWorldName(world.name);
          setWorldTone(world.tone);
        }
      }
    } catch {
      // Non-fatal — world name falls back to worldId
    }
  }

  async function handleClickTemplate(templateId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const story = await createStory(worldId, instanceId, templateId);
      navigate(
        `/world/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}/story/${encodeURIComponent(story.storyId)}`
      );
    } catch (err) {
      console.error("[Parley] createStory failed:", err);
    } finally {
      setBusy(false);
    }
  }

  function handleClickStoryInstance(story: StorySummary) {
    navigate(
      `/world/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}/story/${encodeURIComponent(story.storyId)}`
    );
  }

  // Group stories into in_progress, completed, abandoned
  const inProgress = storyInstances.filter((s) => s.status === "in_progress");
  const completed = storyInstances.filter((s) => s.status === "completed");
  const abandoned = storyInstances.filter((s) => s.status === "abandoned");

  // Build story groups: each template + its instances
  const storyGroups: StoryGroup[] = templates.map((templateId) => ({
    templateId,
    instances: inProgress.filter((s) => s.storyId === templateId),
  }));

  return (
    <div class="l2-worldhome">
      {/* Header */}
      <header class="shell-header">
        <button
          class="back-link"
          type="button"
          onClick={() => navigate("/")}
        >
          ‹ Parley
        </button>
        <div class="world-title-group">
          <h1 class="world-title">{worldName}</h1>
          {worldTone && (
            <span class="header-meta">{worldTone}</span>
          )}
        </div>
        <InstanceSwitcher
          worldId={worldId}
          currentInstanceId={instanceId}
          instances={instances}
          onInstancesChange={() => getInstances(worldId).then(setInstances)}
        />
      </header>

      <div class="l2-body">
        {loading ? (
          <div class="l2-empty" aria-busy="true">Loading stories...</div>
        ) : error ? (
          <div class="l1-banner error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                loadStoriesData().finally(() => setLoading(false));
              }}
            >
              Retry
            </button>
          </div>
        ) : templates.length === 0 ? (
          <div class="l2-empty">
            This world ships no story templates yet.
          </div>
        ) : (
          <>
            {/* Story templates with their in_progress instances */}
            {storyGroups.map(({ templateId, instances: instList }) => (
              <div key={templateId} class="story-template-group">
                {/* Template header — click to start new */}
                <div
                  class="story-template-header"
                  onClick={() => handleClickTemplate(templateId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleClickTemplate(templateId);
                    }
                  }}
                  aria-label={`Start new story: ${templateId}`}
                >
                  <h3>{templateId.replace(/-/g, " ")}</h3>
                  <span class="new-badge">+ New</span>
                </div>

                {/* In-progress instances */}
                {instList.length > 0 && (
                  <ul class="story-instances-list">
                    {instList.map((story) => (
                      <li key={story.storyId}>
                        <StoryInstanceRow
                          story={story}
                          onClick={() => handleClickStoryInstance(story)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {/* Completed and Abandoned groups */}
            {completed.length > 0 && (
              <details class="l2-collapsible">
                <summary>Completed ({completed.length})</summary>
                <ul class="story-instances-list">
                  {completed.map((story) => (
                    <li key={story.storyId}>
                      <StoryInstanceRow
                        story={story}
                        onClick={() => handleClickStoryInstance(story)}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {abandoned.length > 0 && (
              <details class="l2-collapsible">
                <summary>Archived ({abandoned.length})</summary>
                <ul class="story-instances-list">
                  {abandoned.map((story) => (
                    <li key={story.storyId}>
                      <StoryInstanceRow
                        story={story}
                        onClick={() => handleClickStoryInstance(story)}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {templates.length > 0 && storyInstances.length === 0 && (
              <p class="l2-empty">
                No saves yet. Pick a template above to start.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface StoryInstanceRowProps {
  story: StorySummary;
  onClick: () => void;
}

function StoryInstanceRow({ story, onClick }: StoryInstanceRowProps): VNode {
  const lastPlayed = story.lastPlayedAt;
  return (
    <div class="story-instance-row" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}>
      <span class="story-instance-label">
        {story.storyId.replace(/-/g, " ")}
      </span>
      <span class="story-instance-meta">
        {story.turnCount} turn{story.turnCount !== 1 ? "s" : ""}
        {lastPlayed ? ` · ${timeAgo(lastPlayed)}` : ""}
      </span>
      <span class={`story-status-badge ${story.status.replace("_", "-")}`}>
        {story.status === "in_progress" ? "In Progress" : story.status === "completed" ? "Completed" : "Archived"}
      </span>
    </div>
  );
}
