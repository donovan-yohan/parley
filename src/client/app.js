const form = document.querySelector("#turn-form");
const input = document.querySelector("#player-action");
const transcript = document.querySelector("#transcript");
const choices = document.querySelector("#choices");
const characters = document.querySelector("#characters");
const truth = document.querySelector("#truth");

const localTranscript = [
  {
    speaker: "narrator",
    text: "The Last Lantern smells of wet wool, hot onions, and lamp oil. Somewhere beyond the shuttered windows, the old north road waits in the rain."
  }
];

render();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const playerAction = input.value.trim();
  if (!playerAction) {
    return;
  }

  localTranscript.push({ speaker: "player", text: playerAction });
  appendTranscriptEntry(localTranscript.at(-1));

  const response = await fetch("/api/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerAction })
  });

  if (!response.ok) {
    const error = await response.json();
    localTranscript.push({ speaker: "system", text: error.error ?? "Turn failed." });
    appendTranscriptEntry(localTranscript.at(-1));
    return;
  }

  const result = await response.json();
  localTranscript.push({ speaker: "narrator", text: result.narration });
  render(result);
});

function render(result) {
  syncTranscript();

  if (!result) {
    choices.replaceChildren(emptyItem("Submit an action to discover choices."));
    characters.replaceChildren(emptyItem("No reusable NPCs yet."));
    return;
  }

  choices.replaceChildren(
    ...result.nextChoices.map((choice) => {
      const item = document.createElement("li");
      item.textContent = choice;
      item.addEventListener("click", () => {
        input.value = choice;
        input.focus();
      });
      return item;
    })
  );

  characters.replaceChildren(
    ...result.characters.map((character) => {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = character.name;
      const meta = document.createElement("span");
      meta.textContent = `${character.belayerGeneratedTalent.role} / ${character.lifecycle}`;
      const tags = document.createElement("div");
      tags.className = "tags";
      tags.replaceChildren(...character.tags.map((tag) => tagChip(tag)));
      item.append(name, meta, tags);
      return item;
    })
  );

  truth.replaceChildren(
    textLine(`Verdict: ${result.truthVerdict.verdict}`),
    textLine(`Accepted: ${result.truthVerdict.accepted_facts.map((fact) => fact.id).join(", ")}`),
    textLine(`Rumors: ${result.truthVerdict.rumors.map((fact) => fact.id).join(", ")}`),
    textLine(`Unresolved: ${result.truthVerdict.unresolved.map((fact) => fact.id).join(", ")}`)
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
