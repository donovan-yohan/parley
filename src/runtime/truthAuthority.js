export function judgeTurn({
  turnId,
  scene,
  scenario,
  playerAction,
  narration,
  character,
  characters = character ? [character] : [],
  proposedFacts
}) {
  const acceptedFacts = proposedFacts.filter((fact) => fact.category === "canon");
  const rumors = proposedFacts.filter((fact) => fact.category === "rumor");
  const leads = proposedFacts.filter((fact) => fact.category === "lead");
  const beliefs = proposedFacts.filter((fact) => fact.category === "belief");
  const unresolved = proposedFacts.filter((fact) => fact.category === "unresolved");
  const rejectedClaims = [];

  const missingCharacters = characters.filter((candidate) => !narration.includes(candidate.name));
  for (const missingCharacter of missingCharacters) {
    rejectedClaims.push({
      id: `missing-${missingCharacter.id}-response`,
      claim: `${missingCharacter.name} appeared in the turn response.`,
      reason: `The narration does not identify ${missingCharacter.name}.`
    });
  }

  if (!String(playerAction ?? "").trim()) {
    rejectedClaims.push({
      id: "missing-player-action",
      claim: "The player took an inspectable action.",
      reason: "The player action was empty."
    });
  }

  if (acceptedFacts.length === 0) {
    rejectedClaims.push({
      id: "missing-canon-fact",
      claim: "The turn proposed at least one canon fact.",
      reason: "No canon facts were proposed for truth review."
    });
  }

  return {
    schema_version: "parley-truth-verdict/v1",
    id: `${turnId}-truth`,
    turn_id: turnId,
    scene_id: scene.id,
    scenario_id: scenario?.id,
    authority: "mock-continuity-editor",
    verdict: rejectedClaims.length === 0 ? "pass" : "revise",
    accepted_facts: acceptedFacts,
    rejected_claims: rejectedClaims,
    rumors,
    leads,
    character_beliefs: beliefs,
    unresolved,
    author_only_hidden_truth: [],
    evidence: [
      scenario?.scenarioPath ?? "examples/last-lantern/scene.yaml",
      `worlds/${scenario?.world?.id ?? "last-lantern"}/state/turns.jsonl`
    ]
  };
}
