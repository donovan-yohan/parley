import { h, Fragment } from "preact";
import type { VNode } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { getWorlds, runTurn } from "@parley/sdk";
import type { WorldSummary } from "@parley/sdk";
import { loadWorldTheme } from "./theme/loadWorldTheme.js";

interface TranscriptEntry {
  speaker: "player" | "narrator" | "system";
  text: string;
}

interface SceneState {
  title: string;
  subtitle: string;
  themeId: string;
  nextChoices: string[];
  defaultPlayerAction: string;
  openingNarration: string;
}

const DEFAULT_INSTANCE_ID = "playthrough-1";

function getDefaultStoryId(worldId: string): string {
  // 1a invariant: each scenario id == world id
  return worldId;
}

export function SinglePageApp(): VNode {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<string>("");
  const [sceneState, setSceneState] = useState<SceneState | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [playerAction, setPlayerAction] = useState("");
  const [turnRunning, setTurnRunning] = useState(false);
  const [statusText, setStatusText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLOListElement>(null);

  // Load worlds on mount.
  // Bootstraps to `last-lantern` when present so the initial world does not
  // depend on `readdir` enumeration order; falls back to the first world the
  // server returns when last-lantern is missing (e.g. custom installs).
  // The scenario load is awaited inside the effect so the form stays disabled
  // until the world has finished loading — otherwise the trailing finally
  // would fire before /api/state resolved.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTurnRunning(true);
      setStatusText("Loading scenarios...");
      try {
        const loadedWorlds = await getWorlds();
        if (cancelled) return;
        setWorlds(loadedWorlds);
        if (loadedWorlds.length > 0) {
          const preferred = loadedWorlds.find((w) => w.id === "last-lantern") ?? loadedWorlds[0];
          await loadScenarioState(preferred.id, loadedWorlds);
        }
      } catch (error) {
        if (cancelled) return;
        const message = (error as Error).message ?? "Could not load scenarios.";
        setTranscript([{ speaker: "system", text: message }]);
      } finally {
        if (!cancelled) {
          setTurnRunning(false);
          setStatusText("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll transcript to bottom when new entries are added
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  async function loadScenarioState(worldId: string, worldList?: WorldSummary[]) {
    const wList = worldList ?? worlds;
    setTurnRunning(true);
    setStatusText("Loading scenario...");
    try {
      const response = await fetch(`/api/state?scenario=${encodeURIComponent(worldId)}`);
      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "Could not load scenario state.");
      }
      const state = (await response.json()) as {
        scenario: { themeId: string; subtitle: string; suggestedPlayerIntents?: string[] };
        scene: { title: string };
        openingNarration: string;
        defaultPlayerAction: string;
        nextChoices?: string[];
      };

      const world = wList.find((w) => w.id === worldId);

      // Apply the world theme (fire-and-forget; does not block the scenario load).
      loadWorldTheme(worldId).catch((err) => {
        console.error(`[Parley] Failed to load theme for world "${worldId}":`, err);
      });

      setSelectedWorldId(worldId);
      setSceneState({
        title: state.scene.title,
        subtitle: state.scenario.subtitle,
        themeId: state.scenario.themeId,
        nextChoices: state.nextChoices ?? state.scenario.suggestedPlayerIntents ?? [],
        defaultPlayerAction: state.defaultPlayerAction,
        openingNarration: state.openingNarration
      });
      setTranscript([{ speaker: "narrator", text: state.openingNarration }]);
      setPlayerAction(state.defaultPlayerAction);
      document.title = `Parley: ${world?.name ?? state.scene.title}`;
      document.documentElement.dataset.theme = state.scenario.themeId;
    } catch (error) {
      setTranscript((prev) => [
        ...prev,
        { speaker: "system", text: (error as Error).message ?? "Could not load scenario state." }
      ]);
    } finally {
      setTurnRunning(false);
      setStatusText("");
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (turnRunning) return;
    const action = playerAction.trim();
    if (!action) return;

    setTranscript((prev) => [...prev, { speaker: "player", text: action }]);
    setPlayerAction("");
    setTurnRunning(true);
    setStatusText("The room weighs the question before answering.");

    try {
      const result = await runTurn({
        worldId: selectedWorldId,
        instanceId: DEFAULT_INSTANCE_ID,
        storyId: getDefaultStoryId(selectedWorldId),
        playerAction: action
      });

      setTranscript((prev) => [...prev, { speaker: "narrator", text: result.narration }]);
      setSceneState((prev) =>
        prev
          ? {
              ...prev,
              nextChoices: result.nextChoices
            }
          : prev
      );
    } catch (error) {
      setTranscript((prev) => [
        ...prev,
        { speaker: "system", text: (error as Error).message ?? "Turn failed." }
      ]);
    } finally {
      setTurnRunning(false);
      setStatusText("");
      inputRef.current?.focus();
    }
  }

  function handleChoiceClick(choice: string) {
    setPlayerAction(choice);
    inputRef.current?.select();
    inputRef.current?.focus();
  }

  async function handleScenarioChange(worldId: string) {
    if (!worldId || worldId === selectedWorldId) return;
    await loadScenarioState(worldId);
  }

  return (
    <main class="app-shell">
      <section class="story-panel" aria-labelledby="scene-title">
        <header class="scene-header">
          <div>
            <h1 id="scene-title">{sceneState?.title ?? "Parley"}</h1>
            <p id="scene-subtitle">{sceneState?.subtitle ?? ""}</p>
          </div>
          <aside id="scene-art" class="scene-art" aria-live="polite">
            Background asset pending.
          </aside>
        </header>

        <ol id="transcript" class="transcript" aria-live="polite" ref={transcriptRef}>
          {transcript.map((entry, index) => (
            <li key={index} class={`turn ${entry.speaker}`}>
              <span class="speaker">{entry.speaker}</span>
              <p>{entry.text}</p>
            </li>
          ))}
        </ol>

        <form id="turn-form" class="turn-form" onSubmit={handleSubmit}>
          <label for="player-action">Player action</label>
          <div class="input-row">
            <input
              id="player-action"
              name="playerAction"
              type="text"
              value={playerAction}
              autocomplete="off"
              disabled={turnRunning}
              onInput={(event) => setPlayerAction((event.target as HTMLInputElement).value)}
              ref={inputRef}
            />
            <button id="submit-turn" type="submit" disabled={turnRunning}>
              {turnRunning ? "Listening..." : "Submit"}
            </button>
          </div>
          <p id="turn-status" class="turn-status" aria-live="polite">
            {statusText}
          </p>
        </form>
      </section>

      <aside class="side-panel" aria-label="Scene state">
        <section>
          <h2>Scenario</h2>
          <label class="theme-label" for="theme-select">Pack</label>
          <select
            id="theme-select"
            name="scenario"
            disabled={turnRunning}
            value={selectedWorldId}
            onChange={(event) => handleScenarioChange((event.target as HTMLSelectElement).value)}
          >
            {worlds.length === 0 && <option value="">Loading scenarios...</option>}
            {worlds.map((world) => (
              <option key={world.id} value={world.id}>
                {world.name}
              </option>
            ))}
          </select>
        </section>

        <section>
          <h2>Next Choices</h2>
          <ul id="choices" class="choice-list">
            {(sceneState?.nextChoices ?? []).length === 0 ? (
              <li class="empty">No choices yet.</li>
            ) : (
              (sceneState?.nextChoices ?? []).map((choice) => (
                <li key={choice}>
                  <button
                    class="choice-button"
                    type="button"
                    disabled={turnRunning}
                    onClick={() => handleChoiceClick(choice)}
                  >
                    {choice}
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section>
          <h2>Reusable NPCs</h2>
          <ul id="characters" class="character-list">
            <li class="empty">No reusable NPCs yet.</li>
          </ul>
        </section>

        <section>
          <h2>Story Memory</h2>
          <div id="truth" class="truth-box">No turn submitted yet.</div>
        </section>
      </aside>
    </main>
  );
}
