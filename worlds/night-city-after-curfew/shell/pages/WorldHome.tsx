/**
 * Night City After Curfew — Custom L2 WorldHome
 *
 * HUD-style chrome with stat-bar header, neon-bordered story list,
 * glitch-on-hover effects, and a scanline overlay div positioned over everything.
 * Functionally equivalent to the default WorldHome but visually distinct.
 */

import { h } from "@parley/sdk";
import type { VNode } from "preact";
import { useState, useEffect } from "@parley/sdk";
import { getStories, createStory } from "@parley/sdk";
import type { StorySummary } from "@parley/sdk";
import { navigate, timeAgo } from "../utils.js";

interface WorldHomeCoreProps {
  worldId: string;
  instanceId: string;
}

export function renderWorldHome({ worldId, instanceId }: WorldHomeCoreProps): VNode {
  const [templates, setTemplates] = useState<string[]>([]);
  const [storyInstances, setStoryInstances] = useState<StorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [worldName, setWorldName] = useState<string>("Night City After Curfew");
  const [worldTone, setWorldTone] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [uptime, setUptime] = useState(0);

  // "System uptime" ticker — purely cosmetic HUD element
  useEffect(() => {
    const start = Date.now();
    const iv = setInterval(() => {
      setUptime(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      loadStoriesData(),
      loadWorldMeta(),
    ])
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "SYSTEM ERROR: could not load stories.");
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
        const data = (await response.json()) as { worlds: Array<{ id: string; name: string; tone: string }> };
        const world = data.worlds.find((w) => w.id === worldId);
        if (world) {
          setWorldName(world.name);
          setWorldTone(world.tone);
        }
      }
    } catch {
      // Non-fatal — falls back to default name
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
      console.error("[NCAC] createStory failed:", err);
    } finally {
      setBusy(false);
    }
  }

  function handleClickStoryInstance(story: StorySummary) {
    navigate(
      `/world/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}/story/${encodeURIComponent(story.storyId)}`
    );
  }

  const inProgress = storyInstances.filter((s) => s.status === "in_progress");
  const completed = storyInstances.filter((s) => s.status === "completed");
  const abandoned = storyInstances.filter((s) => s.status === "abandoned");

  const uptimeStr = String(uptime).padStart(4, "0");

  return h(
    "div",
    { class: "ncac-worldhome-root" },
    // Scanline overlay
    h("div", { class: "ncac-scanlines", "aria-hidden": "true" }),
    h("div", { class: "ncac-vignette", "aria-hidden": "true" }),

    // HUD Header
    h(
      "header",
      { class: "ncac-hud-header" },
      // Stat bar
      h(
        "div",
        { class: "ncac-stat-bar" },
        h("span", { class: "ncac-stat-label" }, "SYS.UPTIME"),
        h("span", { class: "ncac-stat-value" }, `${uptimeStr}s`),
        h("span", { class: "ncac-stat-divider" }),
        h(
          "span",
          { class: "ncac-worldid-badge" },
          `ZONE::${worldId.toUpperCase().replace(/-/g, "_")}`
        ),
      ),
      // Nav row
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.6rem 0.75rem",
          },
        },
        h(
          "button",
          {
            class: "ncac-back-btn",
            type: "button",
            onClick: () => navigate("/"),
          },
          "◄ Jack Out"
        ),
        h(
          "div",
          { style: { flex: 1 } },
          h("h1", { class: "ncac-world-title" }, worldName),
          worldTone && h("div", { class: "ncac-world-tone" }, worldTone),
        ),
      ),
    ),

    // Body
    h(
      "div",
      { class: "ncac-body" },
      loading
        ? h("div", { class: "ncac-empty" }, "LOADING OPERATIVE DOSSIERS...")
        : error
        ? h(
            "div",
            {
              class: "ncac-empty",
              style: { color: "rgba(255,0,200,0.7)" },
              role: "alert",
            },
            error
          )
        : templates.length === 0
        ? h(
            "div",
            { class: "ncac-empty" },
            "NO MISSION TEMPLATES FOUND. CHECK BACK AFTER CURFEW."
          )
        : h(
            "div",
            { class: "ncac-story-list" },
            // Templates
            ...templates.map((templateId) => {
              const instList = inProgress.filter((s) => s.storyId === templateId);
              return h(
                "div",
                { key: templateId, class: "ncac-story-group" },
                h(
                  "div",
                  {
                    class: "ncac-template-header",
                    role: "button",
                    tabIndex: 0,
                    onClick: () => handleClickTemplate(templateId),
                    onKeyDown: (e: KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") handleClickTemplate(templateId);
                    },
                    "aria-label": `Start new story: ${templateId}`,
                  },
                  h(
                    "span",
                    { class: "ncac-template-title" },
                    templateId.replace(/-/g, " ")
                  ),
                  h("span", { class: "ncac-new-badge" }, "+ INITIATE")
                ),
                instList.length > 0 &&
                  h(
                    "ul",
                    { class: "ncac-instance-list" },
                    ...instList.map((story) =>
                      h(
                        "li",
                        { key: story.storyId },
                        h(StoryInstanceRow, {
                          story,
                          onClick: () => handleClickStoryInstance(story),
                        })
                      )
                    )
                  )
              );
            }),

            // Completed
            completed.length > 0 &&
              h(
                "details",
                { class: "ncac-collapsible" },
                h("summary", {}, `ARCHIVED RUNS (${completed.length})`),
                h(
                  "ul",
                  { class: "ncac-instance-list", style: { marginTop: "0.25rem" } },
                  ...completed.map((story) =>
                    h(
                      "li",
                      { key: story.storyId },
                      h(StoryInstanceRow, {
                        story,
                        onClick: () => handleClickStoryInstance(story),
                      })
                    )
                  )
                )
              ),

            // Abandoned
            abandoned.length > 0 &&
              h(
                "details",
                { class: "ncac-collapsible" },
                h("summary", {}, `TERMINATED RUNS (${abandoned.length})`),
                h(
                  "ul",
                  { class: "ncac-instance-list", style: { marginTop: "0.25rem" } },
                  ...abandoned.map((story) =>
                    h(
                      "li",
                      { key: story.storyId },
                      h(StoryInstanceRow, {
                        story,
                        onClick: () => handleClickStoryInstance(story),
                      })
                    )
                  )
                )
              ),

            templates.length > 0 &&
              storyInstances.length === 0 &&
              h(
                "p",
                { class: "ncac-empty" },
                "NO ACTIVE RUNS. SELECT A TEMPLATE TO JACK IN."
              )
          )
    )
  );
}

// ── Story instance row ─────────────────────────────────────────────────────────

interface StoryInstanceRowProps {
  story: StorySummary;
  onClick: () => void;
}

function StoryInstanceRow({ story, onClick }: StoryInstanceRowProps): VNode {
  const lastPlayed = story.lastPlayedAt;
  const statusClass = story.status.replace("_", "-");
  const statusLabel =
    story.status === "in_progress" ? "ACTIVE" : story.status === "completed" ? "DONE" : "TERMINATED";

  return h(
    "div",
    {
      class: "ncac-instance-row",
      onClick,
      role: "button",
      tabIndex: 0,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      },
    },
    h("span", { class: "ncac-instance-label" }, story.storyId.replace(/-/g, " ")),
    h(
      "span",
      { class: "ncac-instance-meta" },
      `${story.turnCount} turn${story.turnCount !== 1 ? "s" : ""}${lastPlayed ? " · " + timeAgo(lastPlayed) : ""}`
    ),
    h("span", { class: `ncac-status-badge ${statusClass}` }, statusLabel)
  );
}

