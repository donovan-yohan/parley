const validFactCategories = new Set(["canon", "rumor", "lead", "belief", "unresolved"]);

export function createScenarioFixtureAuthor() {
  return {
    id: "scenario-fixture-author",
    mode: "deterministic-fixture",
    async authorTurn({ scenario, playerAction, turnId }) {
      const response = selectScenarioResponse({ scenario, playerAction });
      return {
        responseId: response.id,
        narration: response.narration,
        nextChoices: response.nextChoices ?? scenario.suggestedPlayerIntents,
        proposedFacts: buildResponseScopedFacts({ turnId, responseId: response.id, facts: scenario.proposedFacts })
      };
    }
  };
}

export function normalizeAuthoredTurn({ authoredTurn, turnAuthor, scenario, turnId }) {
  if (!authoredTurn || typeof authoredTurn !== "object") {
    throw new Error("turnAuthor must return an authored turn object");
  }

  const responseId = String(authoredTurn.responseId ?? authoredTurn.response_id ?? "unscoped-turn").trim();
  if (!responseId) {
    throw new Error("turnAuthor must return a non-empty responseId");
  }

  const narration = String(authoredTurn.narration ?? "").trim();
  if (!narration) {
    throw new Error("turnAuthor must return narration");
  }

  return {
    responseId,
    narration,
    nextChoices: normalizeNextChoices(authoredTurn.nextChoices, scenario.suggestedPlayerIntents),
    proposedFacts: normalizeProposedFacts({ facts: authoredTurn.proposedFacts, turnId }),
    authoring: {
      author: String(authoredTurn.author ?? turnAuthor.id ?? "unknown-turn-author"),
      mode: String(authoredTurn.mode ?? turnAuthor.mode ?? "custom"),
      response_id: responseId
    }
  };
}

export function buildResponseScopedFacts({ turnId, responseId, facts }) {
  return normalizeProposedFacts({
    turnId,
    facts: facts.filter((fact) => {
      const responseIds = fact.responseIds ?? ["*"];
      return responseIds.includes("*") || responseIds.includes(responseId);
    })
  });
}

export function selectScenarioResponse({ scenario, playerAction }) {
  const normalizedAction = playerAction.toLowerCase();
  return scenario.responses.find((response) =>
    (response.matchAny ?? []).some((phrase) => normalizedAction.includes(String(phrase).toLowerCase()))
  ) ?? scenario.responses.find((response) => response.id === "fallback") ?? scenario.responses[0];
}

function normalizeNextChoices(nextChoices, fallbackChoices) {
  const choices = nextChoices ?? fallbackChoices;
  if (!Array.isArray(choices)) {
    throw new Error("turnAuthor nextChoices must be an array");
  }

  return choices.map((choice, index) => {
    const normalizedChoice = String(choice ?? "").trim();
    if (!normalizedChoice) {
      throw new Error(`turnAuthor nextChoices[${index}] must be a non-empty string`);
    }
    return normalizedChoice;
  });
}

function normalizeProposedFacts({ facts = [], turnId }) {
  if (!Array.isArray(facts)) {
    throw new Error("turnAuthor proposedFacts must be an array");
  }

  return facts.map((fact, index) => {
    if (!fact || typeof fact !== "object" || Array.isArray(fact)) {
      throw new Error(`turnAuthor proposedFacts[${index}] must be an object`);
    }

    const { responseIds, ...factWithoutResponseScope } = fact;
    const normalizedFact = {
      ...factWithoutResponseScope,
      id: String(fact.id ?? "").trim(),
      category: String(fact.category ?? "").trim(),
      text: String(fact.text ?? "").trim(),
      evidence_turn: turnId
    };

    if (!normalizedFact.id) {
      throw new Error(`turnAuthor proposedFacts[${index}] missing id`);
    }
    if (!validFactCategories.has(normalizedFact.category)) {
      throw new Error(`turnAuthor proposedFacts[${index}] has invalid category ${normalizedFact.category}`);
    }
    if (!normalizedFact.text) {
      throw new Error(`turnAuthor proposedFacts[${index}] missing text`);
    }

    return normalizedFact;
  });
}
