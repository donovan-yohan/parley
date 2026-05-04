import assert from "node:assert/strict";
import test from "node:test";

import { validateProfileNameBudget } from "../../src/runtime/instances/profileNameBudget.js";

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("happy path: realistic crag and talent", () => {
  const result = validateProfileNameBudget("last-lantern-alpha", "mara-underbough");
  assert.equal(result.ok, true);
  assert.equal(result.profileName, "blyr-last-lantern-alpha-mara-underbough");
  assert.equal(result.errors, undefined);
});

test("happy path: single-char crag and talent (minimum)", () => {
  const result = validateProfileNameBudget("a", "b");
  assert.equal(result.ok, true);
  assert.equal(result.profileName, "blyr-a-b");
  assert.equal(result.errors, undefined);
});

// ---------------------------------------------------------------------------
// Boundary: total length
// ---------------------------------------------------------------------------

test("boundary: exactly 58 total chars (crag=25, talent=33) → ok", () => {
  // crag: 25 chars, talent: 33 chars, total = 58 → ok
  const crag = "a" + "b".repeat(24);   // 25 chars
  const talent = "c" + "d".repeat(32); // 33 chars
  assert.equal(crag.length, 25);
  assert.equal(talent.length, 33);

  const result = validateProfileNameBudget(crag, talent);
  assert.equal(result.ok, true);
  assert.equal(result.profileName, `blyr-${crag}-${talent}`);
  assert.equal(result.profileName.length, 64); // 5 + 25 + 1 + 33 = 64
});

test("boundary: 59 total chars (crag=26 after trim… let's use crag=25, talent=34 but cap talent at 33) → use crag=25+1=overflow via profileName field", () => {
  // Force a combined length of 59 using valid individual slugs that together overflow
  // crag 25 + talent 33 = 58 (ok), so we need crag=26 which also triggers cragSlug error.
  // Instead: use crag=10, talent=49 which exceeds talentName regex limit too.
  // Best approach: crag=25 (valid), talent=34 chars (too long for talentName regex) — that triggers
  // talentName error, not profileName. We need both to be individually valid but combined too long.
  // Individual maxes: crag ≤ 25, talent ≤ 33 → max combined = 58. So we can't get 59 with valid slugs.
  // Solution: use crag=26 (valid by prefix rule but over limit → triggers cragSlug error + profileName error).
  // Actually spec says we can still push both errors — test for profileName field error message specifically.
  // Per spec, use valid-looking 26-char crag + valid talent to get the profileName field error.
  // But a 26-char crag fails cragSlug regex, so we get BOTH cragSlug error AND profileName error.
  // That's fine — let's test that profileName error appears when total is 59:
  const crag = "a" + "b".repeat(25);   // 26 chars → fails cragSlug, total combined 26+33=59 → profileName error
  const talent = "c" + "d".repeat(32); // 33 chars (valid)
  const result = validateProfileNameBudget(crag, talent);
  assert.equal(result.ok, false);
  // Should have errors for both cragSlug (26 chars) and profileName (59 total)
  const fields = result.errors.map((e) => e.field);
  assert.ok(fields.includes("profileName"), `expected profileName error, got: ${JSON.stringify(result.errors)}`);
  const profileNameErr = result.errors.find((e) => e.field === "profileName");
  assert.ok(
    profileNameErr.message.includes("59"),
    `expected '59' in message, got: ${profileNameErr.message}`,
  );
  assert.ok(
    profileNameErr.message.includes("58"),
    `expected '58' in message, got: ${profileNameErr.message}`,
  );
  assert.ok(
    profileNameErr.message.includes("--short-name"),
    `expected '--short-name' in message, got: ${profileNameErr.message}`,
  );
});

test("boundary: crag exactly 25 chars → ok", () => {
  const crag = "a" + "b".repeat(24); // 25 chars
  const result = validateProfileNameBudget(crag, "b");
  assert.equal(result.ok, true);
});

test("boundary: crag 26 chars → cragSlug field error", () => {
  const crag = "a" + "b".repeat(25); // 26 chars
  const result = validateProfileNameBudget(crag, "b");
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors));
  const slugErr = result.errors.find((e) => e.field === "cragSlug");
  assert.ok(slugErr, `expected cragSlug error, got: ${JSON.stringify(result.errors)}`);
  assert.equal(result.profileName, undefined);
});

// ---------------------------------------------------------------------------
// Invalid characters
// ---------------------------------------------------------------------------

test("invalid: crag with uppercase → cragSlug field error", () => {
  const result = validateProfileNameBudget("Last-Lantern", "mara-underbough");
  assert.equal(result.ok, false);
  const err = result.errors.find((e) => e.field === "cragSlug");
  assert.ok(err, `expected cragSlug error, got: ${JSON.stringify(result.errors)}`);
  assert.equal(result.profileName, undefined);
});

test("invalid: crag with leading hyphen → cragSlug field error", () => {
  const result = validateProfileNameBudget("-bad", "mara-underbough");
  assert.equal(result.ok, false);
  const err = result.errors.find((e) => e.field === "cragSlug");
  assert.ok(err, `expected cragSlug error, got: ${JSON.stringify(result.errors)}`);
});

test("invalid: talent with leading hyphen → talentName field error", () => {
  const result = validateProfileNameBudget("last-lantern", "-bad-talent");
  assert.equal(result.ok, false);
  const err = result.errors.find((e) => e.field === "talentName");
  assert.ok(err, `expected talentName error, got: ${JSON.stringify(result.errors)}`);
});

test("invalid: talent with space → talentName field error", () => {
  const result = validateProfileNameBudget("last-lantern", "mara underbough");
  assert.equal(result.ok, false);
  const err = result.errors.find((e) => e.field === "talentName");
  assert.ok(err, `expected talentName error, got: ${JSON.stringify(result.errors)}`);
});

// ---------------------------------------------------------------------------
// Multi-error
// ---------------------------------------------------------------------------

test("multi-error: both crag and talent invalid → returns BOTH errors", () => {
  const result = validateProfileNameBudget("Last-Lantern", "-bad-talent");
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors));
  const fields = result.errors.map((e) => e.field);
  assert.ok(fields.includes("cragSlug"), `missing cragSlug error in: ${JSON.stringify(result.errors)}`);
  assert.ok(fields.includes("talentName"), `missing talentName error in: ${JSON.stringify(result.errors)}`);
  assert.equal(result.errors.length >= 2, true);
});
