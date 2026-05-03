import { authorDetourTurn } from "./dm/detourTools.js";

const validFactCategories = new Set(["canon", "rumor", "lead", "belief", "unresolved"]);

export function createScenarioFixtureAuthor() {
  return {
    id: "scenario-fixture-author",
    mode: "deterministic-fixture",
    async authorTurn({ scenario, scene, playerAction, turnId }) {
      const detourTurn = authorDetourTurn({ turnId, scenario, scene, playerAction });
      if (detourTurn) {
        return detourTurn;
      }

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

  const responseId = String(authoredTurn.responseId ?? authoredTurn.response_id ?? "").trim();
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
    actionInterpretation: authoredTurn.actionInterpretation ?? null,
    detourScene: authoredTurn.detourScene ?? null,
    storyConsequence: authoredTurn.storyConsequence ?? null,
    beatRedirect: authoredTurn.beatRedirect ?? null,
    handledRejectedClaims: normalizeHandledRejectedClaims(authoredTurn.handledRejectedClaims),
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

function normalizeHandledRejectedClaims(claims = []) {
  if (!Array.isArray(claims)) {
    throw new Error("turnAuthor handledRejectedClaims must be an array");
  }
  return claims.map((claim, index) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
      throw new Error(`turnAuthor handledRejectedClaims[${index}] must be an object`);
    }
    return {
      id: String(claim.id ?? `handled-claim-${index + 1}`).trim(),
      claim: String(claim.claim ?? "").trim(),
      reason: String(claim.reason ?? "Unsupported player claim was rejected.").trim(),
      handled: claim.handled !== false
    };
  }).filter((claim) => claim.claim);
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
