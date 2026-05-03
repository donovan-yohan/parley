const schemaVersions = {
  actionInterpretation: "parley-action-interpretation/v1",
  storyAttractor: "parley-story-attractor/v1",
  detourScene: "parley-detour-scene/v1",
  storyConsequence: "parley-story-consequence/v1",
  beatRedirect: "parley-beat-redirect/v1"
};

export function validateActionInterpretation(value) {
  const artifact = objectWithSchema(value, schemaVersions.actionInterpretation, "action interpretation");
  requiredString(artifact, "turn_id");
  requiredString(artifact, "intent");
  requiredString(artifact, "plausibility");
  requiredString(artifact, "cooperation");
  requiredString(artifact, "claim_policy");
  requiredString(artifact, "consequence_level");
  requiredString(artifact, "recommended_mode");
  requiredArray(artifact, "targets");
  requiredArray(artifact, "candidate_attractors");
  optionalArray(artifact, "unsupported_claims");
  return artifact;
}

export function validateStoryAttractor(value) {
  const artifact = objectWithSchema(value, schemaVersions.storyAttractor, "story attractor");
  requiredString(artifact, "id");
  requiredString(artifact, "story_instance_id");
  requiredString(artifact, "priority");
  requiredString(artifact, "intent");
  requiredArray(artifact, "acceptable_routes");
  requiredArray(artifact, "forbidden_shortcuts");
  requiredArray(artifact, "success_signals");
  return artifact;
}

export function validateDetourScene(value) {
  const artifact = objectWithSchema(value, schemaVersions.detourScene, "detour scene");
  requiredString(artifact, "id");
  requiredString(artifact, "source_turn_id");
  requiredString(artifact, "scope");
  requiredString(artifact, "title");
  requiredString(artifact, "purpose");
  requiredArray(artifact, "target_attractor_ids");
  requiredPlainObject(artifact, "entry_state");
  requiredArray(artifact, "exit_conditions");
  requiredString(artifact, "expires_after");
  return artifact;
}

export function validateStoryConsequence(value) {
  const artifact = objectWithSchema(value, schemaVersions.storyConsequence, "story consequence");
  requiredString(artifact, "id");
  requiredString(artifact, "source_turn_id");
  requiredString(artifact, "category");
  requiredString(artifact, "scope");
  requiredString(artifact, "summary");
  requiredArray(artifact, "affected_entities");
  optionalArray(artifact, "reputation_deltas");
  optionalArray(artifact, "followup_hooks");
  if (typeof artifact.promotion_eligible !== "boolean") {
    throw new Error("story consequence missing boolean promotion_eligible");
  }
  return artifact;
}

export function validateBeatRedirect(value) {
  const artifact = objectWithSchema(value, schemaVersions.beatRedirect, "beat redirect");
  requiredString(artifact, "id");
  requiredString(artifact, "source_turn_id");
  requiredString(artifact, "from_scene_id");
  requiredString(artifact, "to_attractor_id");
  requiredString(artifact, "route_type");
  requiredString(artifact, "summary");
  requiredArray(artifact, "next_scene_suggestions");
  return artifact;
}

function objectWithSchema(value, schemaVersion, noun) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${noun} must be an object`);
  }
  if (value.schema_version !== schemaVersion) {
    throw new Error(`${noun} must use schema_version ${schemaVersion}`);
  }
  return value;
}

function requiredString(object, key) {
  if (!String(object[key] ?? "").trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
}

function requiredArray(object, key) {
  if (!Array.isArray(object[key]) || object[key].length === 0) {
    throw new Error(`${key} must be a non-empty array`);
  }
}

function optionalArray(object, key) {
  if (object[key] !== undefined && !Array.isArray(object[key])) {
    throw new Error(`${key} must be an array when provided`);
  }
}

function requiredPlainObject(object, key) {
  if (!object[key] || typeof object[key] !== "object" || Array.isArray(object[key])) {
    throw new Error(`${key} must be an object`);
  }
}
