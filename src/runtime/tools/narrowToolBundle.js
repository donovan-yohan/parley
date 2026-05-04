/**
 * Return the subset of catalog tools the character is permitted to call this wake.
 *
 * @param {object} params
 * @param {Array<{name: string, authority: string, write_path: string, description: string}>} params.catalog
 * @param {"actor" | "gm" | "validator"} params.characterAuthority
 * @param {string[] | null} [params.allowedTools] - Optional per-wake explicit allowlist.
 * @returns {Array<object>}
 */
export function narrowToolBundle({ catalog, characterAuthority, allowedTools = null }) {
  // Step 1: filter by authority.
  // actor: tools where authority in {actor, lifecycle}
  // gm: tools where authority in {actor, gm-only, lifecycle}
  // validator: tools where authority in {actor, validator-only, lifecycle}
  const authoritySetByCharacter = {
    actor: ["actor", "lifecycle"],
    gm: ["actor", "gm-only", "lifecycle"],
    validator: ["actor", "validator-only", "lifecycle"]
  };

  const authoritiesAllowed = authoritySetByCharacter[characterAuthority];
  if (!authoritiesAllowed) {
    throw new Error(`unknown characterAuthority: ${characterAuthority}`);
  }

  let narrowed = catalog.filter((t) => authoritiesAllowed.includes(t.authority));

  // Step 2: optional intersect with allowedTools (per-wake explicit narrowing).
  // If allowedTools list contains a tool the character can't use, REJECT (don't silently filter).
  if (allowedTools) {
    const allowedSet = new Set(allowedTools);
    // Pre-validate: if any name in allowedTools refers to a tool the character can't use, throw.
    for (const name of allowedTools) {
      const tool = catalog.find((t) => t.name === name);
      if (!tool) throw new Error(`unknown tool name in allowedTools: ${name}`);
      if (!authoritiesAllowed.includes(tool.authority)) {
        throw new Error(
          `tool ${name} (authority=${tool.authority}) cannot be used by character with authority=${characterAuthority}`
        );
      }
    }
    narrowed = narrowed.filter((t) => allowedSet.has(t.name));
  }

  return narrowed;
}
