import {
  validateActionInterpretation,
  validateBeatRedirect,
  validateDetourScene,
  validateStoryConsequence
} from "./detourContracts.js";

const defaultInterpretation = {
  intent: "normal_inquiry",
  plausibility: "possible",
  cooperation: "cooperative",
  claimPolicy: "attempt_allowed",
  consequenceLevel: "none",
  recommendedMode: "normal_continuation"
};

export function interpretPlayerAction({ turnId, scenario, scene, playerAction }) {
  const guidance = selectDetourGuidance({ scenario, playerAction });
  const hasGuidance = Boolean(guidance);
  const selected = guidance ?? {};
  const targetAttractorIds = selected.targetAttractorIds ?? firstAttractorIds(scenario);
  const interpretation = {
    schema_version: "parley-action-interpretation/v1",
    id: `${turnId}-interpretation`,
    turn_id: turnId,
    player_action: String(playerAction ?? ""),
    scene_id: scene?.id ?? scenario?.scene?.id,
    intent: selected.intent ?? defaultInterpretation.intent,
    plausibility: selected.plausibility ?? defaultInterpretation.plausibility,
    cooperation: selected.cooperation ?? defaultInterpretation.cooperation,
    claim_policy: selected.claimPolicy ?? defaultInterpretation.claimPolicy,
    consequence_level: selected.consequenceLevel ?? defaultInterpretation.consequenceLevel,
    targets: selected.targets ?? scenarioCharacterIds(scenario),
    recommended_mode: hasGuidance ? "detour_scene" : defaultInterpretation.recommendedMode,
    candidate_attractors: targetAttractorIds,
    unsupported_claims: normalizeUnsupportedClaims({ claims: selected.unsupportedClaims, turnId }),
    guidance_id: selected.id ?? null
  };
  return validateActionInterpretation(interpretation);
}

export function createDetourScene({ turnId, scenario, scene, interpretation }) {
  const guidance = requireGuidance({ scenario, interpretation });
  const detour = guidance.detour ?? {};
  const targetAttractorIds = interpretation.candidate_attractors;
  return validateDetourScene({
    schema_version: "parley-detour-scene/v1",
    id: detour.id ?? `detour-${scenario.id}-${guidance.id}-${turnId}`,
    source_turn_id: turnId,
    scope: "story_instance",
    title: detour.title ?? "A Necessary Detour",
    purpose: detour.purpose ?? "Apply consequence and route the action back toward active story pressure.",
    temporary_location: detour.temporaryLocation ?? scene?.id ?? scenario.scene.id,
    target_attractor_ids: targetAttractorIds,
    entry_state: detour.entryState ?? { player_action: interpretation.player_action },
    exit_conditions: detour.exitConditions ?? ["The player accepts the consequence and chooses a grounded next action."],
    expires_after: detour.expiresAfter ?? "scene_resolution"
  });
}

export function recordStoryConsequence({ turnId, scenario, interpretation, detour }) {
  const guidance = requireGuidance({ scenario, interpretation });
  const consequence = guidance.consequence ?? {};
  return validateStoryConsequence({
    schema_version: "parley-story-consequence/v1",
    id: consequence.id ?? `consequence-${turnId}-${guidance.id}`,
    source_turn_id: turnId,
    category: consequence.category ?? "story_detour",
    scope: "story_instance",
    summary: consequence.summary ?? detour.purpose,
    affected_entities: consequence.affectedEntities ?? interpretation.targets,
    reputation_deltas: consequence.reputationDeltas ?? [],
    followup_hooks: consequence.followupHooks ?? [],
    rejected_claims: interpretation.unsupported_claims,
    promotion_eligible: consequence.promotionEligible ?? false
  });
}

export function routeToAttractor({ turnId, scenario, scene, interpretation, consequence }) {
  const guidance = requireGuidance({ scenario, interpretation });
  const redirect = guidance.redirect ?? {};
  const toAttractorId = interpretation.candidate_attractors[0];
  return validateBeatRedirect({
    schema_version: "parley-beat-redirect/v1",
    id: redirect.id ?? `redirect-${turnId}-${guidance.id}`,
    source_turn_id: turnId,
    from_scene_id: scene?.id ?? scenario.scene.id,
    to_attractor_id: toAttractorId,
    route_type: redirect.routeType ?? "consequence_reveal",
    summary: redirect.summary ?? consequence.summary,
    next_scene_suggestions: redirect.nextSceneSuggestions ?? scenario.suggestedPlayerIntents
  });
}

export function authorDetourTurn({ turnId, scenario, scene, playerAction }) {
  const interpretation = interpretPlayerAction({ turnId, scenario, scene, playerAction });
  if (interpretation.recommended_mode !== "detour_scene") {
    return null;
  }

  const guidance = requireGuidance({ scenario, interpretation });
  const detourScene = createDetourScene({ turnId, scenario, scene, interpretation });
  const storyConsequence = recordStoryConsequence({ turnId, scenario, interpretation, detour: detourScene });
  const beatRedirect = routeToAttractor({ turnId, scenario, scene, interpretation, consequence: storyConsequence });
  const proposedFacts = [
    ...scenario.proposedFacts.filter((fact) => (fact.responseIds ?? ["*"]).includes("*")),
    ...(guidance.memoryFacts ?? [])
  ];

  return {
    responseId: `detour-${scenario.id}-${guidance.id}`,
    narration: guidance.narration,
    nextChoices: beatRedirect.next_scene_suggestions,
    proposedFacts,
    actionInterpretation: interpretation,
    detourScene,
    storyConsequence,
    beatRedirect,
    handledRejectedClaims: interpretation.unsupported_claims
  };
}

function selectDetourGuidance({ scenario, playerAction }) {
  const action = normalizeText(playerAction);
  return (scenario.dmDetourGuidance ?? [])
    .map((guidance) => ({ guidance, score: scoreGuidance({ guidance, action }) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.guidance ?? null;
}

function scoreGuidance({ guidance, action }) {
  const matchAnyGroups = guidance.matchAnyGroups ?? [];
  if (matchAnyGroups.length && !matchAnyGroups.every((group) => group.some((phrase) => action.includes(normalizeText(phrase))))) {
    return 0;
  }

  const matchAny = guidance.matchAny ?? [];
  const matchCount = matchAny.filter((phrase) => action.includes(normalizeText(phrase))).length;
  const required = guidance.matchRequired ?? [];
  const requiredMatches = required.every((phrase) => action.includes(normalizeText(phrase)));
  if (required.length && !requiredMatches) {
    return 0;
  }
  return matchCount + required.length + matchAnyGroups.length;
}

function requireGuidance({ scenario, interpretation }) {
  const guidance = (scenario.dmDetourGuidance ?? []).find((candidate) => candidate.id === interpretation.guidance_id);
  if (!guidance) {
    throw new Error(`No DM detour guidance found for ${interpretation.guidance_id}`);
  }
  return guidance;
}

function firstAttractorIds(scenario) {
  return (scenario.storyAttractors ?? []).slice(0, 1).map((attractor) => attractor.id);
}

function scenarioCharacterIds(scenario) {
  return (scenario.characters ?? []).map((character) => character.id);
}

function normalizeUnsupportedClaims({ claims = [], turnId }) {
  return claims.map((claim, index) => ({
    id: claim.id ?? `handled-unsupported-claim-${turnId}-${index + 1}`,
    claim: String(claim.claim ?? claim.text ?? "").trim(),
    reason: String(claim.reason ?? "Unsupported player claim was rejected while preserving the plausible attempt.").trim(),
    handled: true
  })).filter((claim) => claim.claim);
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}
