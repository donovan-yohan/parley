/**
 * profileNameBudget.js
 *
 * Validates that a (cragSlug, talentName) pair fits within the Hermes 64-char
 * profile-name limit when assembled as "blyr-<crag>-<talent>".
 *
 * Hard limits (verified against internal/cli/prune.go + Hermes profile spec):
 *   - Hermes profile name regex: ^[a-z0-9][a-z0-9_-]{0,63}$ (64-char limit)
 *   - Profile name format: blyr-<crag>-<talent>
 *   - cragSlug:   ^[a-z0-9][a-z0-9_-]{0,24}$  (≤25 chars)
 *   - talentName: ^[a-z0-9][a-z0-9_-]{0,32}$  (≤33 chars)
 *   - Combined budget: cragSlug.length + talentName.length ≤ 58
 */

const CRAG_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,24}$/;
const TALENT_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,32}$/;
const HERMES_PROFILE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const MAX_COMBINED = 58;
const HERMES_MAX_LENGTH = 64;

/**
 * Validate that cragSlug and talentName produce a legal Hermes profile name.
 *
 * @param {string} cragSlug  - Belayer crag identifier (≤25 chars, [a-z0-9][a-z0-9_-]*)
 * @param {string} talentName - Belayer talent identifier (≤33 chars, [a-z0-9][a-z0-9_-]*)
 * @returns {{ ok: true, profileName: string } | { ok: false, errors: Array<{ field: string, message: string }> }}
 */
export function validateProfileNameBudget(cragSlug, talentName) {
  const errors = [];

  // 1. Validate cragSlug
  if (!CRAG_SLUG_RE.test(cragSlug)) {
    errors.push({
      field: "cragSlug",
      message: `cragSlug "${cragSlug}" is invalid. Must match ^[a-z0-9][a-z0-9_-]{0,24}$ (max 25 chars, leading alphanumeric, [a-z0-9_-] only).`,
    });
  }

  // 2. Validate talentName
  if (!TALENT_NAME_RE.test(talentName)) {
    errors.push({
      field: "talentName",
      message: `talentName "${talentName}" is invalid. Must match ^[a-z0-9][a-z0-9_-]{0,32}$ (max 33 chars, leading alphanumeric, [a-z0-9_-] only).`,
    });
  }

  // 3. Compute profile name
  const profileName = `blyr-${cragSlug}-${talentName}`;
  const combined = cragSlug.length + talentName.length;

  // 4. Check combined length budget
  if (combined > MAX_COMBINED) {
    errors.push({
      field: "profileName",
      message: `Crag slug + character id exceeds 58 chars (got ${combined}). Shorten one of them or use --short-name override.`,
    });
  }

  // 5. Defense-in-depth: check full profile name against Hermes regex
  if (profileName.length <= HERMES_MAX_LENGTH && !HERMES_PROFILE_RE.test(profileName)) {
    errors.push({
      field: "profileName",
      message: `Assembled profile name "${profileName}" does not satisfy Hermes profile name constraints (^[a-z0-9][a-z0-9_-]{0,63}$).`,
    });
  }

  // 6. Return result
  if (errors.length === 0) {
    return { ok: true, profileName };
  }
  return { ok: false, errors };
}
