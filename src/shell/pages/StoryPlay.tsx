/**
 * StoryPlay.tsx — L3 Story play screen (world-skinned).
 *
 * Full-bleed scene backdrop + transcript (narration + speaker dialogue with
 * inline portraits + player actions) + input + suggested intents + rejection pill.
 *
 * On mount: applyThemeForWorld(worldId).
 */

import { h, Fragment } from "preact";
import type { VNode } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { runTurn, getStory } from "../../sdk/api.js";
import type { AuthoredTurn } from "../../runtime/agentAuthor.js";
import { navigate } from "../router.js";
import { applyThemeForWorld } from "../state/worldStore.js";
import { SceneBackdrop } from "../components/SceneBackdrop.js";
import { InlinePortrait } from "../components/InlinePortrait.js";
import { RejectionPill } from "../components/RejectionPill.js";

interface StoryPlayProps {
  worldId: string;
  instanceId: string;
  storyId: string;
}

// A turn entry in our local transcript
type TranscriptEntry =
  | { type: "player"; text: string }
  | { type: "narration"; text: string }
  | { type: "speaker"; characterId: string; quote: string };

export function StoryPlay({ worldId, instanceId, storyId }: StoryPlayProps): VNode {
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
    applyThemeForWorld(worldId).catch(() => {});
  }, [worldId]);

  useEffect(() => {
    loadStoryState();
  }, [worldId, instanceId, storyId]);

  // Auto-scroll transcript to bottom when new turns arrive
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  async function loadStoryState() {
    try {
      const story = await getStory({ worldId, instanceId, storyId });
      setTurnCount(story.turnCount);
      setStoryLoaded(true);
    } catch {
      // Story might be brand new — that's fine
      setStoryLoaded(true);
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (turnRunning) return;
    const action = playerAction.trim();
    if (!action) return;

    // Append player action immediately
    setTranscript((prev) => [...prev, { type: "player", text: action }]);
    setPlayerAction("");
    setRejectionMessage(null);
    setTurnRunning(true);

    try {
      const result = await runTurn({ worldId, instanceId, storyId, playerAction: action });

      // Check for rejection verdict (the server sets a "verdict" field when revise)
      const maybeVerdict = result as AuthoredTurn & { verdict?: string; rejectionMessage?: string };
      if (maybeVerdict.verdict === "revise") {
        // Rejection: don't modify transcript, show pill
        // Remove the player action we just appended
        setTranscript((prev) => prev.slice(0, -1));
        setRejectionMessage(maybeVerdict.rejectionMessage ?? "That action isn't allowed right now. Try something else.");
        return;
      }

      // Successful turn: append narration + speakers
      const newEntries: TranscriptEntry[] = [];

      if (result.narration) {
        newEntries.push({ type: "narration", text: result.narration });
      }

      for (const speaker of result.speakers ?? []) {
        if (speaker.quote) {
          newEntries.push({
            type: "speaker",
            characterId: speaker.characterId,
            quote: speaker.quote,
          });
        }
      }

      setTranscript((prev) => [...prev, ...newEntries]);
      setNextChoices(result.nextChoices ?? []);
      setTurnCount((c) => c + 1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The turn could not be authored.";
      setRejectionMessage(message);
      // Remove the player action we appended
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

  // Format a character ID into a display name
  function characterDisplayName(characterId: string): string {
    return characterId
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div class="l3-storyplay">
      {/* Full-bleed backdrop */}
      <div class="l3-backdrop-wrapper">
        <SceneBackdrop
          worldId={worldId}
          instanceId={instanceId}
          storyId={storyId}
          class="l3-backdrop"
        />
      </div>

      {/* Content overlay */}
      <div class="l3-content">
        {/* Header */}
        <header class="l3-header">
          <button
            class="back-link"
            type="button"
            onClick={() =>
              navigate(`/world/${encodeURIComponent(worldId)}/${encodeURIComponent(instanceId)}`)
            }
          >
            ‹ Parley
          </button>
          <p class="scene-name">{storyId.replace(/-/g, " ")}</p>
          <span class="turn-count">Turn {turnCount}</span>
        </header>

        {/* Transcript */}
        <div class="l3-transcript" aria-live="polite" aria-label="Story transcript">
          {!storyLoaded ? (
            <>
              <div class="transcript-narration skeleton" style={{ height: "4rem" }} />
              <div class="transcript-narration skeleton" style={{ height: "2.5rem", opacity: 0.7 }} />
            </>
          ) : transcript.length === 0 ? (
            <p class="transcript-narration" style={{ opacity: 0.65 }}>
              Your story begins here. What do you do?
            </p>
          ) : (
            transcript.map((entry, i) => {
              if (entry.type === "player") {
                return (
                  <p key={i} class="transcript-player-action">
                    {entry.text}
                  </p>
                );
              }
              if (entry.type === "narration") {
                return (
                  <p key={i} class="transcript-narration">
                    {entry.text}
                  </p>
                );
              }
              if (entry.type === "speaker") {
                return (
                  <div key={i} class="transcript-speaker">
                    <InlinePortrait characterName={characterDisplayName(entry.characterId)}>
                      {entry.quote}
                    </InlinePortrait>
                  </div>
                );
              }
              return null;
            })
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Footer input area */}
        <footer class="l3-footer">
          <div class="l3-footer-inner">
            {/* Rejection pill */}
            {rejectionMessage && (
              <RejectionPill message={rejectionMessage} />
            )}

            {/* Input row */}
            <form class="l3-input-row" onSubmit={handleSubmit}>
              <input
                class="l3-input"
                ref={inputRef}
                type="text"
                value={playerAction}
                placeholder="What do you do?"
                disabled={turnRunning}
                onInput={(e) =>
                  setPlayerAction((e.target as HTMLInputElement).value)
                }
                autocomplete="off"
                aria-label="Player action"
              />
              <button
                class="l3-submit-btn"
                type="submit"
                disabled={turnRunning || !playerAction.trim()}
              >
                {turnRunning ? "..." : "Submit"}
              </button>
            </form>

            {/* Suggested intents */}
            {nextChoices.length > 0 && (
              <div class="l3-choices" role="group" aria-label="Suggested actions">
                {nextChoices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    class="l3-choice-btn"
                    disabled={turnRunning}
                    onClick={() => handleChoiceClick(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
