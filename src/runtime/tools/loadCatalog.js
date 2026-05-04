import catalog from "./catalog.json" with { type: "json" };

/**
 * Load and optionally validate the tool catalog.
 *
 * @param {object} [options]
 * @param {((data: unknown) => unknown) | null} [options.validateCatalog] - Injected validator
 *   (e.g. ToolCatalogSchema.parse). If absent, returns the catalog without schema validation.
 * @returns {import("./catalog.json")}
 */
export function loadCatalog({ validateCatalog = null } = {}) {
  // validateCatalog is injected by callers (ToolCatalogSchema.parse).
  // If absent, returns the catalog without schema validation (still safe — JSON shape known).
  if (validateCatalog) return validateCatalog(catalog);
  return catalog;
}

/**
 * Look up a tool entry by name.
 *
 * @param {string} name
 * @param {object} [options]
 * @param {((data: unknown) => unknown) | null} [options.validateCatalog]
 * @returns {object | null}
 */
export function getToolByName(name, { validateCatalog = null } = {}) {
  const list = loadCatalog({ validateCatalog });
  return list.find((t) => t.name === name) ?? null;
}
