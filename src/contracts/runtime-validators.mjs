/**
 * runtime-validators.mjs
 *
 * Re-exports Zod parse functions from .ts contracts for use in plain JS ESM
 * runtime files (server.js, parleyRuntime.js, etc.).
 *
 * This file is loaded via the tsx loader:
 *   node --import tsx src/server.js
 *
 * The tsx loader transparently transpiles .ts imports at runtime, so this
 * .mjs shim can safely re-export from the TypeScript contract files.
 *
 * Usage in callers:
 *   import { validators } from "./contracts/runtime-validators.mjs";
 *   const { validateWake, validateWakeResult } = validators;
 *
 * If tsx is not active (e.g. tests that don't use the tsx loader), callers
 * should inject their own validator stubs instead of importing this file.
 */

import { ParleyWakeSchema } from "./parleyWake.ts";
import { ParleyWakeResultSchema } from "./parleyWakeResult.ts";
import { ParleyImageWakeSchema } from "./parleyImageWake.ts";
import { ParleyImageWakeResultSchema } from "./parleyImageWakeResult.ts";

/**
 * Validator function for ParleyWake envelopes.
 * Throws a ZodError on invalid input.
 * @param {unknown} value
 * @returns {import("./parleyWake.ts").ParleyWake}
 */
export function validateWake(value) {
  return ParleyWakeSchema.parse(value);
}

/**
 * Validator function for ParleyWakeResult envelopes.
 * Throws a ZodError on invalid input.
 * @param {unknown} value
 * @returns {import("./parleyWakeResult.ts").ParleyWakeResult}
 */
export function validateWakeResult(value) {
  return ParleyWakeResultSchema.parse(value);
}

/**
 * Validator function for ParleyImageWake envelopes.
 * Throws a ZodError on invalid input.
 */
export function validateImageWake(value) {
  return ParleyImageWakeSchema.parse(value);
}

/**
 * Validator function for ParleyImageWakeResult envelopes.
 * Throws a ZodError on invalid input.
 */
export function validateImageWakeResult(value) {
  return ParleyImageWakeResultSchema.parse(value);
}

/**
 * Convenience object grouping all validators — matches the wakeValidationDeps
 * shape consumed by parleyRuntime.runPlayerTurn.
 */
export const validators = {
  validateWake,
  validateWakeResult,
  validateImageWake,
  validateImageWakeResult,
};
