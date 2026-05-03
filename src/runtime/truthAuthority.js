export function judgeTurn({
  turnId,
  scene,
  playerAction,
  narration,
  character,
  proposedFacts
}) {
  const mentionsMara = narration.includes(character.name);
  const asksNorthRoad = /north road|old road/i.test(playerAction);

  const acceptedFacts = proposedFacts.filter((fact) => fact.category === "canon");
  const rumors = proposedFacts.filter((fact) => fact.category === "rumor");
  const beliefs = proposedFacts.filter((fact) => fact.category === "belief");
  const unresolved = proposedFacts.filter((fact) => fact.category === "unresolved");
  const rejectedClaims = [];

  if (!mentionsMara) {
    rejectedClaims.push({
      id: "missing-mara-response",
      claim: "The tavernkeep answered the player.",
      reason: "The narration does not identify Mara Underbough."
    });
  }

  if (!asksNorthRoad) {
    rejectedClaims.push({
      id: "unsupported-road-topic",
      claim: "The player asked about the old north road.",
      reason: "The player action did not mention the old or north road."
    });
  }

  return {
    schema_version: "parley-truth-verdict/v1",
    id: `${turnId}-truth`,
    turn_id: turnId,
    scene_id: scene.id,
    authority: "mock-continuity-editor",
    verdict: rejectedClaims.length === 0 ? "pass" : "revise",
    accepted_facts: acceptedFacts,
    rejected_claims: rejectedClaims,
    rumors,
    character_beliefs: beliefs,
    unresolved,
    author_only_hidden_truth: [],
    evidence: [
      "examples/last-lantern/scene.yaml",
      `worlds/last-lantern/state/turns.jsonl`
    ]
  };
}
