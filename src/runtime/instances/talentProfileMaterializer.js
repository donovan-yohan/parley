/**
 * talentProfileMaterializer.js
 *
 * Materializes a .belayer-talent.yaml file in a Hermes profile directory.
 *
 * The shape of the written YAML is kept in sync MANUALLY with:
 *   src/contracts/belayerTalentMetadata.ts  (BelayerTalentMetadataSchema)
 *
 * IMPORTANT: If fields are added/removed from BelayerTalentMetadataSchema,
 * update REQUIRED_FIELDS, VALID_MEMORY_SCOPES, and the YAML writer below.
 *
 * Note: We intentionally do NOT import the Zod schema here because the JS
 * test runner (node --test) does not support TypeScript imports. Validation
 * is done inline via validateMetadataShape().
 */

import { mkdir, writeFile, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { validateProfileNameBudget } from "./profileNameBudget.js";

// ---------------------------------------------------------------------------
// Inline metadata shape validator
// Keep in sync with src/contracts/belayerTalentMetadata.ts
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = [
  "profile_name",
  "talent_name",
  "crag_slug",
  "memory_scope",
  "materialized_at",
];

const VALID_MEMORY_SCOPES = ["climb", "crag", "talent"];

/**
 * Validate the shape of parsed metadata. Throws descriptively on any violation.
 * @param {Record<string, string>} obj
 */
function validateMetadataShape(obj) {
  const missing = REQUIRED_FIELDS.filter((k) => !(k in obj));
  if (missing.length) throw new Error(`metadata missing fields: ${missing.join(", ")}`);

  const extras = Object.keys(obj).filter((k) => !REQUIRED_FIELDS.includes(k));
  if (extras.length) throw new Error(`metadata has unexpected fields: ${extras.join(", ")}`);

  if (!VALID_MEMORY_SCOPES.includes(obj.memory_scope)) {
    throw new Error(
      `metadata memory_scope must be one of ${VALID_MEMORY_SCOPES.join(", ")}, got ${obj.memory_scope}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Minimal flat-YAML parser (handles only flat string scalars)
// ---------------------------------------------------------------------------

/**
 * Parse a flat YAML file where every line is `key: value`.
 * No nesting, no lists, no anchors. Strips leading/trailing quotes on values.
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseFlatYaml(content) {
  const obj = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    obj[key] = value;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Materialize a .belayer-talent.yaml profile directory.
 *
 * @param {object} opts
 * @param {string} opts.cragSlug           - Belayer crag identifier
 * @param {string} opts.talentName         - Belayer talent identifier
 * @param {string} opts.memoryScope        - One of: "climb" | "crag" | "talent"
 * @param {string} opts.hermesProfilesRoot - Root directory where profiles live
 * @param {boolean} [opts.force=false]     - Overwrite existing profile if true
 *
 * @returns {Promise<{ profileDir: string, profileName: string, alreadyExists: boolean }>}
 */
export async function materializeTalentProfile({
  cragSlug,
  talentName,
  memoryScope,
  hermesProfilesRoot,
  force = false,
}) {
  // 1. Validate profile name budget
  const budgetResult = validateProfileNameBudget(cragSlug, talentName);
  if (!budgetResult.ok) {
    throw new Error("invalid profile name budget: " + JSON.stringify(budgetResult.errors));
  }
  const { profileName } = budgetResult;

  // 2. Compute profile directory path
  const profileDir = path.join(hermesProfilesRoot, profileName);

  // 3. Idempotency check: if directory exists and force is false, return early
  if (!force) {
    const exists = await stat(profileDir)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      return { profileDir, profileName, alreadyExists: true };
    }
  }

  // 4. Create profile directory recursively
  await mkdir(profileDir, { recursive: true });

  // 5. Write .belayer-talent.yaml
  const yamlPath = path.join(profileDir, ".belayer-talent.yaml");
  const materializedAt = new Date().toISOString();
  const yamlContent = [
    `profile_name: ${profileName}`,
    `talent_name: ${talentName}`,
    `crag_slug: ${cragSlug}`,
    `memory_scope: ${memoryScope}`,
    `materialized_at: ${materializedAt}`,
    "", // trailing newline
  ].join("\n");

  await writeFile(yamlPath, yamlContent, "utf8");

  // 6. Validate the written file before returning (catches drift between writer and schema)
  const writtenContent = await readFile(yamlPath, "utf8");
  const parsed = parseFlatYaml(writtenContent);
  try {
    validateMetadataShape(parsed);
  } catch (err) {
    // Bad file — clean up and re-throw
    await unlink(yamlPath).catch(() => {});
    throw new Error(`written .belayer-talent.yaml failed shape validation: ${err.message}`);
  }

  // 7. Return result
  return { profileDir, profileName, alreadyExists: false };
}
