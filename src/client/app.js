const form = document.querySelector("#turn-form");
const input = document.querySelector("#player-action");
const submitButton = document.querySelector("#submit-turn");
const turnStatus = document.querySelector("#turn-status");
const transcript = document.querySelector("#transcript");
const choices = document.querySelector("#choices");
const characters = document.querySelector("#characters");
const truth = document.querySelector("#truth");
const themeSelect = document.querySelector("#theme-select");
let latestResult = null;
let turnRunning = false;

const localTranscript = [
  {
    speaker: "narrator",
    text: "The Last Lantern smells of wet wool, hot onions, and lamp oil. Somewhere beyond the shuttered windows, the old north road waits in the rain."
  }
];

render();

themeSelect.addEventListener("change", () => {
  document.documentElement.dataset.theme = themeSelect.value;
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
  render(latestResult);

  try {
    const response = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerAction })
    });

    if (!response.ok) {
      const error = await response.json();
      localTranscript.push({ speaker: "system", text: error.error ?? "Turn failed." });
      return;
    }

    latestResult = await response.json();
    localTranscript.push({ speaker: "narrator", text: latestResult.narration });
  } catch (error) {
    localTranscript.push({ speaker: "system", text: error.message ?? "Turn failed." });
  } finally {
    setTurnRunning(false);
    render(latestResult);
    input.focus();
  }
});

function render(result) {
  syncTranscript();

  if (!result) {
    choices.replaceChildren(emptyItem("Submit an action to discover choices."));
    characters.replaceChildren(emptyItem("No reusable NPCs yet."));
    truth.replaceChildren(textLine("No story memory yet."));
    return;
  }

  choices.replaceChildren(
    ...result.nextChoices.map((choice) => {
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
    ...result.characters.map((character) => {
      const item = document.createElement("li");
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
      item.append(name, meta, note, tags);
      return item;
    })
  );

  truth.replaceChildren(
    memoryGroup("What changed", result.truthVerdict.accepted_facts),
    memoryGroup("Leads", result.truthVerdict.leads ?? []),
    memoryGroup("Rumors", result.truthVerdict.rumors),
    memoryGroup("Unresolved", result.truthVerdict.unresolved)
  );
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

function setTurnRunning(isRunning) {
  turnRunning = isRunning;
  input.disabled = isRunning;
  submitButton.disabled = isRunning;
  submitButton.textContent = isRunning ? "Listening..." : "Submit";
  turnStatus.textContent = isRunning ? "The room weighs the question before answering." : "";
}

function describeCharacter(character) {
  const role = humanTag(character.tags?.find((tag) => tag.startsWith("role:")) ?? character.belayerGeneratedTalent?.role ?? "");
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

function memoryGroup(label, facts) {
  const group = document.createElement("section");
  const title = document.createElement("h3");
  title.textContent = label;
  const list = document.createElement("ul");
  list.replaceChildren(
    ...(facts.length ? facts.map((fact) => {
      const item = document.createElement("li");
      item.textContent = fact.text;
      return item;
    }) : [emptyItem("Nothing recorded yet.")])
  );
  group.append(title, list);
  return group;
}
