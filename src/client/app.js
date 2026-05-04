const form = document.querySelector("#turn-form");
const input = document.querySelector("#player-action");
const submitButton = document.querySelector("#submit-turn");
const turnStatus = document.querySelector("#turn-status");
const transcript = document.querySelector("#transcript");
const choices = document.querySelector("#choices");
const characters = document.querySelector("#characters");
const truth = document.querySelector("#truth");
const scenarioSelect = document.querySelector("#theme-select");
const sceneTitle = document.querySelector("#scene-title");
const sceneSubtitle = document.querySelector("#scene-subtitle");
const sceneArt = document.querySelector("#scene-art");

let scenarios = [];
let selectedScenarioId = null;
let currentState = null;
let latestResult = null;
let localTranscript = [];
let turnRunning = false;

init();

scenarioSelect.addEventListener("change", async () => {
  if (!scenarioSelect.value || scenarioSelect.value === selectedScenarioId) {
    return;
  }
  await loadScenarioState(scenarioSelect.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (turnRunning) {
    return;
  }
  const playerAction = input.value.trim();
  if (!playerAction) {
    return;
  }

  localTranscript.push({ speaker: "player", text: playerAction });
  input.value = "";
  setTurnRunning(true);
  render();

  try {
    const response = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId: selectedScenarioId, playerAction })
    });

    if (!response.ok) {
      const error = await response.json();
      localTranscript.push({ speaker: "system", text: error.error ?? "Turn failed." });
      return;
    }

    latestResult = await response.json();
    currentState = mergeTurnIntoState({ state: currentState, result: latestResult });
    localTranscript.push({ speaker: "narrator", text: latestResult.narration });
    if (latestResult.scenarioId ?? selectedScenarioId) {
      startEventStream(latestResult.scenarioId ?? selectedScenarioId);
    }
  } catch (error) {
    localTranscript.push({ speaker: "system", text: error.message ?? "Turn failed." });
  } finally {
    setTurnRunning(false);
    render();
    input.focus();
  }
});

async function init() {
  setTurnRunning(true, "Loading scenarios...");
  try {
    const response = await fetch("/api/scenarios");
    if (!response.ok) {
      throw new Error("Could not load scenarios.");
    }
    const payload = await response.json();
    scenarios = payload.scenarios;
    scenarioSelect.replaceChildren(...scenarios.map((scenario) => scenarioOption(scenario)));
    await loadScenarioState(payload.defaultScenarioId);
  } catch (error) {
    localTranscript = [{ speaker: "system", text: error.message ?? "Could not load scenarios." }];
    render();
  } finally {
    setTurnRunning(false);
  }
}

async function loadScenarioState(scenarioId) {
  setTurnRunning(true, "Loading scenario...");
  try {
    const response = await fetch(`/api/state?scenario=${encodeURIComponent(scenarioId)}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error ?? "Could not load scenario state.");
    }
    currentState = await response.json();
    latestResult = null;
    selectedScenarioId = currentState.scenario.id;
    scenarioSelect.value = selectedScenarioId;
    applyScenarioChrome(currentState);
    localTranscript = [{ speaker: "narrator", text: currentState.openingNarration }];
    transcript.replaceChildren();
    input.value = currentState.defaultPlayerAction;
    render();
  } catch (error) {
    localTranscript.push({ speaker: "system", text: error.message ?? "Could not load scenario state." });
    render();
  } finally {
    setTurnRunning(false);
  }
}

function applyScenarioChrome(state) {
  document.documentElement.dataset.theme = state.scenario.themeId;
  document.title = `Parley: ${state.scenario.title}`;
  sceneTitle.textContent = state.scene.title;
  sceneSubtitle.textContent = state.scenario.subtitle;
}

function render() {
  syncTranscript();

  const view = stateView(currentState);
  renderSceneArt(view);
  if (!view) {
    choices.replaceChildren(emptyItem("No scenario loaded."));
    characters.replaceChildren(emptyItem("No reusable NPCs yet."));
    truth.replaceChildren(textLine("No story memory yet."));
    return;
  }

  choices.replaceChildren(
    ...view.nextChoices.map((choice) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = "choice-button";
      button.type = "button";
      button.disabled = turnRunning;
      button.textContent = choice;
      button.addEventListener("click", () => {
        input.value = choice;
        input.select();
        input.focus();
      });
      item.append(button);
      return item;
    })
  );

  characters.replaceChildren(
    ...(view.characters.length
      ? view.characters.map((character) => {
        const item = document.createElement("li");
        const portrait = renderCharacterPortrait(character);
        const details = document.createElement("div");
        details.className = "character-details";
        const name = document.createElement("strong");
        name.textContent = character.name;
        const meta = document.createElement("span");
        meta.textContent = describeCharacter(character);
        const note = document.createElement("p");
        note.textContent = describeCharacterNote(character);
        const tags = document.createElement("div");
        tags.className = "tags";
        const translatedTags = [...new Set((character.tags ?? []).map((tag) => humanTag(tag)))];
        tags.replaceChildren(...translatedTags.map((tag) => tagChip(tag)));
        details.append(name, meta, note, tags);
        item.append(portrait, details);
        return item;
      })
      : [emptyItem("No reusable NPCs yet.")])
  );

  if (!view.truthVerdict) {
    truth.replaceChildren(textLine("No story memory yet."));
    return;
  }

  truth.replaceChildren(
    memoryGroup("What changed", view.truthVerdict.accepted_facts),
    memoryGroup("Consequences", view.truthVerdict.story_consequences ?? []),
    memoryGroup("Leads", view.truthVerdict.leads ?? []),
    memoryGroup("Rumors", view.truthVerdict.rumors),
    memoryGroup("Character beliefs", view.truthVerdict.character_beliefs ?? []),
    memoryGroup("Rejected claims", view.truthVerdict.rejected_claims ?? []),
    memoryGroup("Unresolved", view.truthVerdict.unresolved)
  );
}

function renderSceneArt(view) {
  const background = view?.visualAssets?.assets?.find(
    (asset) => asset.kind === "background" && asset.entity_id === view.scene?.id
  ) ?? view?.visualAssets?.assets?.find((asset) => asset.kind === "background");
  sceneArt.replaceChildren();
  sceneArt.className = `scene-art ${background?.status ?? "missing"}`;

  if (!background) {
    sceneArt.textContent = "Background asset pending.";
    return;
  }

  if (background.public_url) {
    const image = document.createElement("img");
    image.src = background.public_url;
    image.alt = `${background.entity_name} background`;
    const caption = document.createElement("span");
    caption.textContent = "Saved background asset";
    sceneArt.append(image, caption);
    return;
  }

  sceneArt.textContent = `${assetStatusLabel(background, "Background")} · ${background.entity_name}`;
}

function renderCharacterPortrait(character) {
  const portrait = document.createElement("div");
  portrait.className = `portrait-frame ${character.portrait?.status ?? "missing"}`;

  if (character.portrait?.public_url) {
    const image = document.createElement("img");
    image.src = character.portrait.public_url;
    image.alt = `${character.name} portrait`;
    portrait.append(image);
    return portrait;
  }

  const initials = document.createElement("strong");
  initials.textContent = character.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const status = document.createElement("span");
  status.textContent = assetStatusLabel(character.portrait, "Portrait");
  portrait.append(initials, status);
  return portrait;
}

function assetStatusLabel(asset, noun) {
  const status = asset?.status ?? "missing";
  if (status === "prompt_ready") {
    return `${noun} prompt ready`;
  }
  if (status === "generated" || status === "locked") {
    return `${noun} saved`;
  }
  if (status === "failed") {
    return `${noun} failed`;
  }
  if (status === "generating") {
    return `${noun} generating`;
  }
  if (status === "deferred") {
    return `${noun} deferred`;
  }
  if (status === "missing") {
    return `${noun} missing`;
  }
  return `${noun} ${status.replaceAll("_", " ")}`;
}

function stateView(state) {
  if (!state) {
    return null;
  }

  return {
    scene: state.scene,
    nextChoices: state.nextChoices ?? [],
    characters: state.characters ?? [],
    truthVerdict: state.worldState ? {
      accepted_facts: state.worldState.canon ?? [],
      leads: state.worldState.leads ?? [],
      rumors: state.worldState.rumors ?? [],
      character_beliefs: state.worldState.character_beliefs ?? [],
      rejected_claims: state.worldState.rejected_claims ?? [],
      story_consequences: state.worldState.story_consequences ?? [],
      unresolved: state.worldState.unresolved ?? []
    } : null,
    visualAssets: state.visualAssets ?? state.worldState?.visual_assets ?? null
  };
}

function mergeTurnIntoState({ state, result }) {
  return {
    ...(state ?? {}),
    scenario: result.scenario,
    scene: result.scene,
    visualAssets: result.visualAssets,
    worldState: result.worldState,
    characters: result.characters,
    nextChoices: result.nextChoices
  };
}

function syncTranscript() {
  for (const entry of localTranscript.slice(transcript.children.length)) {
    appendTranscriptEntry(entry);
  }
}

function appendTranscriptEntry(entry) {
  const item = document.createElement("li");
  item.className = `turn ${entry.speaker}`;
  const speaker = document.createElement("span");
  speaker.className = "speaker";
  speaker.textContent = entry.speaker;
  const text = document.createElement("p");
  text.textContent = entry.text;
  item.append(speaker, text);
  transcript.append(item);
}

function scenarioOption(scenario) {
  const option = document.createElement("option");
  option.value = scenario.id;
  option.textContent = scenario.title;
  return option;
}

function emptyItem(text) {
  const item = document.createElement("li");
  item.className = "empty";
  item.textContent = text;
  return item;
}

function tagChip(tag) {
  const chip = document.createElement("span");
  chip.className = "tag";
  chip.textContent = tag;
  return chip;
}

function textLine(text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  return paragraph;
}

function setTurnRunning(isRunning, statusText = "") {
  turnRunning = isRunning;
  input.disabled = isRunning;
  scenarioSelect.disabled = isRunning;
  submitButton.disabled = isRunning;
  for (const choiceItem of choices.children) {
    for (const choiceButton of choiceItem.children ?? []) {
      choiceButton.disabled = isRunning;
    }
  }
  submitButton.textContent = isRunning ? "Listening..." : "Submit";
  turnStatus.textContent = isRunning ? statusText || "The room weighs the question before answering." : "";
}

function describeCharacter(character) {
  const role = humanTag(character.tags?.find((tag) => tag.startsWith("role:")) ?? character.belayerGeneratedTalent?.role ?? character.belayer_generated_talent?.role ?? "");
  const faction = humanTag(character.tags?.find((tag) => tag.startsWith("faction:")) ?? "");
  const tone = humanTag(character.tags?.find((tag) => tag.startsWith("tone:")) ?? "");
  const lifecycle = humanTag(character.lifecycle ?? "");
  return [role, faction, tone, lifecycle].filter(Boolean).join(" / ");
}

function describeCharacterNote(character) {
  const lifecycle = humanTag(character.lifecycle ?? "").toLowerCase();
  const reusable = character.reusable ? "reusable" : "scene-bound";
  return `${character.name} is a ${reusable}${lifecycle ? `, ${lifecycle}` : ""} NPC available through Parley's character record.`;
}

function humanTag(tag) {
  const value = String(tag).includes(":") ? String(tag).split(":").slice(1).join(":") : String(tag);
  return value
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function startEventStream(storyId) {
  if (window._parleyEventSource) {
    window._parleyEventSource.close();
  }
  const es = new EventSource(`/events/${encodeURIComponent(storyId)}`);
  es.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      handleStoryEvent(event);
    } catch {}
  };
  es.onerror = () => {
    // Browser will auto-reconnect
  };
  window._parleyEventSource = es;
}

function handleStoryEvent(event) {
  // Handle visual_asset_ready: update portrait or background img elements.
  if (event.type === "visual_asset_ready") {
    const path = event.inputs?.path;
    const kind = event.inputs?.target?.kind;
    const id = event.inputs?.target?.id;
    if (!path) return; // backward compat: skip silently if path missing

    if (kind === "background") {
      const bg = document.getElementById("scene-background");
      if (bg) {
        bg.src = path;
        bg.classList.add("asset-fade-in");
      }
    } else if (kind === "portrait") {
      let portrait = document.getElementById(`portrait-${id}`);
      if (!portrait) {
        const strip = document.getElementById("portraits-strip");
        if (!strip) return; // skip silently if container absent
        portrait = document.createElement("img");
        portrait.id = `portrait-${id}`;
        portrait.alt = id ?? "character portrait";
        portrait.className = "portrait-thumbnail";
        strip.appendChild(portrait);
      }
      portrait.src = path;
      portrait.classList.add("asset-fade-in");
    }
    return;
  }

  // Minimal renderer: append to #event-stream if it exists; else console.log.
  const container = document.getElementById("event-stream");
  if (!container) {
    console.log("[story event]", event);
    return;
  }
  const el = document.createElement("div");
  el.className = `event event-${event.type ?? "unknown"}`;
  el.textContent = `${event.emitted_at} — ${event.type}: ${JSON.stringify(event.inputs ?? event.refs ?? {})}`;
  container.appendChild(el);
}

function memoryGroup(label, facts) {
  const group = document.createElement("section");
  const title = document.createElement("h3");
  title.textContent = label;
  const list = document.createElement("ul");
  list.replaceChildren(
    ...(facts.length ? facts.map((fact) => {
      const item = document.createElement("li");
      item.textContent = fact.text ?? fact.summary ?? fact.claim ?? fact.reason ?? JSON.stringify(fact);
      return item;
    }) : [emptyItem("Nothing recorded yet.")])
  );
  group.append(title, list);
  return group;
}
