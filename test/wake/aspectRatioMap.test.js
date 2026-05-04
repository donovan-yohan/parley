/**
 * aspectRatioMap.test.js
 *
 * Unit tests for src/runtime/wake/aspectRatioMap.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapAspectRatio } from "../../src/runtime/wake/aspectRatioMap.js";

describe("mapAspectRatio — known ratios", () => {
  it('maps "3:4" to "portrait"', () => {
    assert.equal(mapAspectRatio("3:4"), "portrait");
  });

  it('maps "4:3" to "landscape"', () => {
    assert.equal(mapAspectRatio("4:3"), "landscape");
  });

  it('maps "16:9" to "landscape"', () => {
    assert.equal(mapAspectRatio("16:9"), "landscape");
  });

  it('maps "9:16" to "portrait"', () => {
    assert.equal(mapAspectRatio("9:16"), "portrait");
  });

  it('maps "1:1" to "square"', () => {
    assert.equal(mapAspectRatio("1:1"), "square");
  });
});

describe("mapAspectRatio — unknown / edge cases", () => {
  it('maps unknown string to "landscape"', () => {
    assert.equal(mapAspectRatio("21:9"), "landscape");
  });

  it('maps empty string to "landscape"', () => {
    assert.equal(mapAspectRatio(""), "landscape");
  });

  it('maps undefined to "landscape"', () => {
    assert.equal(mapAspectRatio(undefined), "landscape");
  });

  it('maps null to "landscape"', () => {
    assert.equal(mapAspectRatio(null), "landscape");
  });

  it("trims whitespace before lookup", () => {
    assert.equal(mapAspectRatio("  1:1  "), "square");
  });
});
