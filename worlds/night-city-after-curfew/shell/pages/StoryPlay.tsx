/**
 * Night City After Curfew — Custom L3 StoryPlay
 *
 * Full-bleed black bg with neon grid overlay, transcript in monospace with
 * bright cyan speaker labels, dialogue inside neon-bordered angular boxes,
 * input with neon-glow focus state. Calls runTurn from the SDK.
 */

import { h } from "@parley/sdk";
import type { VNode } from "preact";
import { useState, useEffect, useRef } from "@parley/sdk";
import { runTurn, getStory } from "@parley/sdk";

// Locally-inlined authored turn shape (mirrors agentAuthor.AuthoredTurn)
// to avoid a runtime dependency on shell internals from the world bundle.
interface AuthoredTurn {
  narration?: string;
  speakers?: Array<{ characterId: string; quote?: string }>;
  nextChoices?: string[];
  verdict?: string;
  rejectionMessage?: string;
}

declare const __PARLEY_SDK__: {
  navigate?: (path: string) => void;
};

function navigate(path: string) {
  if (typeof __PARLEY_SDK__ !== "undefined" && typeof __PARLEY_SDK__.navigate === "function") {
    __PARLEY_SDK__.navigate(path);
  } else {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

type TranscriptEntry =
  | { type: "player"; text: string }
  | { type: "narration"; text: string }
  | { type: "speaker"; characterId: string; quote: string };

interface StoryPlayCoreProps {
  worldId: string;
  instanceId: string;
  storyId: string;
}

export function renderStoryPlay({ worldId, instanceId, storyId }: StoryPlayCoreProps): VNode {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [nextChoices, setNextChoices] = useState<string[]>([]);
  const [playerAction, setPlayerAction] = useState("");
  const [turnRunning, setTurnRunning] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);
  const [storyLoaded, setStoryLoaded] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStoryState();
  }, [worldId, instanceId, storyId]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  async function loadStoryState() {
    try {
      const story = await getStory({ worldId, instanceId, storyId });
      setTurnCount(story.turnCount);
      setStoryLoaded(true);
    } catch {
      setStoryLoaded(true);
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (turnRunning) return;
    const action = playerAction.trim();
    if (!action) return;

    setTranscript((prev) => [...prev, { type: "player", text: action }]);
    setPlayerAction("");
    setRejectionMessage(null);
    setTurnRunning(true);

    try {
      const result = await runTurn({ worldId, instanceId, storyId, playerAction: action });
      const maybeVerdict = result as AuthoredTurn & { verdict?: string; rejectionMessage?: string };

      if (maybeVerdict.verdict === "revise") {
        setTranscript((prev) => prev.slice(0, -1));
        setRejectionMessage(
          maybeVerdict.rejectionMessage ?? "ACCESS DENIED — that action isn't on the table."
        );
        return;
      }

      const newEntries: TranscriptEntry[] = [];
      if (result.narration) {
        newEntries.push({ type: "narration", text: result.narration });
      }
      for (const speaker of result.speakers ?? []) {
        if (speaker.quote) {
          newEntries.push({ type: "speaker", characterId: speaker.characterId, quote: speaker.quote });
        }
      }

      setTranscript((prev) => [...prev, ...newEntries]);
      setNextChoices(result.nextChoices ?? []);
      setTurnCount((c) => c + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "SYSTEM FAULT — turn could not be authored.";
      setRejectionMessage(msg);
      setTranscript((prev) => prev.slice(0, -1));
    } finally {
      setTurnRunning(false);
      inputRef.current?.focus();
    }
  }

  function handleChoiceClick(choice: string) {
    setPlayerAction(choice);
    inputRef.current?.focus();
  }

  function characterDisplayName(characterId: string): string {
    return characterId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const turnPad = String(turnCount).padStart(3, "0");
  const sceneLabel = storyId.replace(/-/g, " ").toUpperCase();

  return h(
    "div",
    { class: "ncac-storyplay-root" },
    // Scanlines
    h("div", { class: "ncac-scanlines", "aria-hidden": "true" }),
    h("div", { class: "ncac-vignette", "aria-hidden": "true" }),

    // Background with neon grid
    h(
      "div",
      { class: "ncac-storyplay-bg" },
      h("div", { class: "ncac-neon-grid", "aria-hidden": "true" })
    ),

    // HUD Header
    h(
      "header",
      { class: "ncac-hud-header", style: { position: "relative", zIndex: 2 } },
      h(
        "div",
        { class: "ncac-stat-bar" },
        h("span", { class: "ncac-stat-label" }, "TURN"),
        h("span", { class: "ncac-stat-value" }, turnPad),
        h("span", { class: "ncac-stat-divider" }),
        h("span", { class: "ncac-worldid-badge" }, sceneLabel)
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.5rem 0.75rem",
          },
        },
        h(
          "button",
          {
            class: "ncac-back-btn",
            type: "button",
            onClick: () =>
              navigate(
                `/world/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}`
              ),
          },
          "◄ Mission Select"
        ),
        h(
          "h1",
          {
            class: "ncac-l3-title",
            style: { fontSize: "0.85rem", margin: 0, flex: 1 },
          },
          storyId.replace(/-/g, " ")
        )
      )
    ),

    // Transcript
    h(
      "div",
      {
        class: "ncac-transcript",
        "aria-live": "polite",
        "aria-label": "Story transcript",
      },
      !storyLoaded
        ? h(
            "div",
            { class: "ncac-narration", style: { opacity: 0.5 } },
            "DECRYPTING MISSION BRIEF..."
          )
        : transcript.length === 0
        ? h(
            "div",
            { class: "ncac-narration", style: { opacity: 0.6 } },
            "CONNECTION ESTABLISHED. AWAITING OPERATIVE INPUT."
          )
        : transcript.map((entry, i) => {
            if (entry.type === "player") {
              return h(
                "div",
                { key: i, class: "ncac-player-action" },
                `> ${entry.text}`
              );
            }
            if (entry.type === "narration") {
              return h("p", { key: i, class: "ncac-narration" }, entry.text);
            }
            if (entry.type === "speaker") {
              return h(
                "div",
                { key: i, class: "ncac-speaker-box" },
                h("span", { class: "ncac-speaker-label" }, characterDisplayName(entry.characterId)),
                h("p", { class: "ncac-speaker-quote" }, entry.quote)
              );
            }
            return null;
          }),
      h("div", { ref: transcriptEndRef })
    ),

    // Footer input area
    h(
      "footer",
      { class: "ncac-footer" },
      rejectionMessage &&
        h("div", { class: "ncac-rejection", role: "alert" }, `// ${rejectionMessage}`),

      h(
        "form",
        { class: "ncac-input-row", onSubmit: handleSubmit },
        h("input", {
          class: "ncac-text-input",
          ref: inputRef,
          type: "text",
          value: playerAction,
          placeholder: "INPUT COMMAND...",
          disabled: turnRunning,
          onInput: (e: InputEvent) =>
            setPlayerAction((e.target as HTMLInputElement).value),
          autocomplete: "off",
          "aria-label": "Player action",
        }),
        h(
          "button",
          {
            class: "ncac-submit-btn",
            type: "submit",
            disabled: turnRunning || !playerAction.trim(),
          },
          turnRunning ? "EXEC..." : "EXECUTE"
        )
      ),

      nextChoices.length > 0 &&
        h(
          "div",
          { class: "ncac-choices", role: "group", "aria-label": "Suggested actions" },
          ...nextChoices.map((choice) =>
            h(
              "button",
              {
                key: choice,
                type: "button",
                class: "ncac-choice-btn",
                disabled: turnRunning,
                onClick: () => handleChoiceClick(choice),
              },
              choice
            )
          )
        )
    )
  );
}
