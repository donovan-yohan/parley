const schemaVersions = {
  actionInterpretation: "parley-action-interpretation/v1",
  storyAttractor: "parley-story-attractor/v1",
  detourScene: "parley-detour-scene/v1",
  storyConsequence: "parley-story-consequence/v1",
  beatRedirect: "parley-beat-redirect/v1"
};

export function validateActionInterpretation(value) {
  const artifact = objectWithSchema(value, schemaVersions.actionInterpretation, "action interpretation");
  allowedKeys(artifact, [
    "schema_version",
    "id",
    "turn_id",
    "player_action",
    "scene_id",
    "intent",
    "plausibility",
    "cooperation",
    "claim_policy",
    "consequence_level",
    "targets",
    "recommended_mode",
    "candidate_attractors",
    "unsupported_claims",
    "guidance_id"
  ], "action interpretation");
  requiredString(artifact, "turn_id");
  requiredString(artifact, "intent");
  requiredString(artifact, "plausibility");
  requiredString(artifact, "cooperation");
  requiredString(artifact, "claim_policy");
  requiredString(artifact, "consequence_level");
  requiredString(artifact, "recommended_mode");
  enumValue(artifact, "recommended_mode", ["normal_continuation", "detour_scene"]);
  requiredArray(artifact, "targets");
  if (artifact.recommended_mode === "detour_scene") {
    requiredArray(artifact, "candidate_attractors");
  } else {
    optionalArray(artifact, "candidate_attractors");
  }
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
  allowedKeys(artifact, [
    "schema_version",
    "id",
    "source_turn_id",
    "scope",
    "title",
    "purpose",
    "temporary_location",
    "target_attractor_ids",
    "entry_state",
    "exit_conditions",
    "expires_after"
  ], "detour scene");
  requiredString(artifact, "id");
  requiredString(artifact, "source_turn_id");
  requiredString(artifact, "scope");
  enumValue(artifact, "scope", ["story_instance"]);
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
  allowedKeys(artifact, [
    "schema_version",
    "id",
    "source_turn_id",
    "category",
    "scope",
    "summary",
    "affected_entities",
    "reputation_deltas",
    "followup_hooks",
    "rejected_claims",
    "promotion_eligible"
  ], "story consequence");
  requiredString(artifact, "id");
  requiredString(artifact, "source_turn_id");
  requiredString(artifact, "category");
  requiredString(artifact, "scope");
  enumValue(artifact, "scope", ["story_instance"]);
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
  allowedKeys(artifact, [
    "schema_version",
    "id",
    "source_turn_id",
    "from_scene_id",
    "to_attractor_id",
    "route_type",
    "summary",
    "next_scene_suggestions"
  ], "beat redirect");
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

function allowedKeys(object, keys, noun) {
  const allowed = new Set(keys);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new Error(`${noun} has unexpected_field ${key}`);
    }
  }
}

function enumValue(object, key, allowedValues) {
  if (!allowedValues.includes(object[key])) {
    throw new Error(`${key} must be one of ${allowedValues.join(", ")}`);
  }
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
