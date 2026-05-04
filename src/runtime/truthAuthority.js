export function judgeTurn({
  turnId,
  scene,
  scenario,
  playerAction,
  narration,
  character,
  characters = character ? [character] : [],
  proposedFacts,
  handledRejectedClaims = [],
  instanceDir,
  worldDir
}) {
  const blockingRejectedClaims = [];
  const handledClaims = handledRejectedClaims.map((claim) => ({
    id: claim.id,
    claim: claim.claim,
    reason: claim.reason,
    handled: true
  }));
  const contractCanonFacts = new Map(
    (scenario?.proposedFacts ?? [])
      .filter((fact) => fact.category === "canon")
      .map((fact) => [fact.id, fact])
  );
  const unsupportedCanonFacts = proposedFacts.filter((fact) => {
    if (fact.category !== "canon") {
      return false;
    }
    const contractFact = contractCanonFacts.get(fact.id);
    return !contractFact || normalizeFactText(contractFact.text) !== normalizeFactText(fact.text);
  });
  const acceptedFacts = proposedFacts
    .filter((fact) => {
      if (fact.category !== "canon") {
        return false;
      }
      const contractFact = contractCanonFacts.get(fact.id);
      return contractFact && normalizeFactText(contractFact.text) === normalizeFactText(fact.text);
    })
    .map((fact) => materializeContractFact({ contractFact: contractCanonFacts.get(fact.id), evidenceTurn: fact.evidence_turn }));
  const rumors = proposedFacts.filter((fact) => fact.category === "rumor");
  const leads = proposedFacts.filter((fact) => fact.category === "lead");
  const beliefs = proposedFacts.filter((fact) => fact.category === "belief");
  const unresolved = proposedFacts.filter((fact) => fact.category === "unresolved");

  for (const unsupportedCanonFact of unsupportedCanonFacts) {
    blockingRejectedClaims.push({
      id: `unsupported-canon-${unsupportedCanonFact.id}`,
      claim: unsupportedCanonFact.text,
      reason:
        "The turn author proposed canon outside the scenario/world contract. Use the exact contract fact, or downgrade this to a belief, rumor, lead, or unresolved thread unless the world contract explicitly allows it."
    });
  }

  const missingCharacters = characters.filter((candidate) => !narration.includes(candidate.name));
  for (const missingCharacter of missingCharacters) {
    blockingRejectedClaims.push({
      id: `missing-${missingCharacter.id}-response`,
      claim: `${missingCharacter.name} appeared in the turn response.`,
      reason: `The narration does not identify ${missingCharacter.name}.`
    });
  }

  if (!String(playerAction ?? "").trim()) {
    blockingRejectedClaims.push({
      id: "missing-player-action",
      claim: "The player took an inspectable action.",
      reason: "The player action was empty."
    });
  }

  const hasAnyContribution =
    acceptedFacts.length > 0 ||
    rumors.length > 0 ||
    leads.length > 0 ||
    beliefs.length > 0 ||
    unresolved.length > 0;

  if (!hasAnyContribution) {
    blockingRejectedClaims.push({
      id: "missing-turn-contribution",
      claim: "The turn proposed at least one canon, belief, rumor, lead, or unresolved entry.",
      reason: "No proposed facts of any category were provided for truth review."
    });
  }

  return {
    schema_version: "parley-truth-verdict/v1",
    id: `${turnId}-truth`,
    turn_id: turnId,
    scene_id: scene.id,
    scenario_id: scenario?.id,
    authority: "mock-continuity-editor",
    verdict: blockingRejectedClaims.length === 0 ? "pass" : "revise",
    accepted_facts: acceptedFacts,
    rejected_claims: [...blockingRejectedClaims, ...handledClaims],
    rumors,
    leads,
    character_beliefs: beliefs,
    unresolved,
    author_only_hidden_truth: [],
    evidence: buildEvidencePaths({ scenario, instanceDir, worldDir })
  };
}

function materializeContractFact({ contractFact, evidenceTurn }) {
  const { responseIds, ...durableContractFact } = contractFact;
  return {
    ...durableContractFact,
    evidence_turn: evidenceTurn
  };
}

function buildEvidencePaths({ scenario, instanceDir, worldDir }) {
  const evidence = [];
  if (scenario?.scenarioPath) {
    evidence.push(scenario.scenarioPath);
  }
  if (instanceDir) {
    evidence.push(`${instanceDir}/turns.jsonl`);
  } else if (scenario?.world?.id) {
    evidence.push(`instances/${scenario.world.id}/playthrough-1/turns.jsonl`);
  }
  return evidence;
}

function normalizeFactText(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]+$/g, "");
}
