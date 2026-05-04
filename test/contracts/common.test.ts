import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TurnId,
  IsoDateTime,
  WorldId,
  SceneId,
  CharacterId,
  CragSlug,
  TalentName,
  InstanceId,
  schemaVersion,
} from "../../src/contracts/common.ts";

// ---------------------------------------------------------------------------
// TurnId
// ---------------------------------------------------------------------------
describe("TurnId", () => {
  it("accepts a valid turn id", () => {
    assert.ok(TurnId.safeParse("turn-0001").success);
  });

  it("accepts a turn id with a larger zero-padded number", () => {
    assert.ok(TurnId.safeParse("turn-0042").success);
  });

  it("accepts a turn id with more than 4 digits", () => {
    assert.ok(TurnId.safeParse("turn-99999999").success);
  });

  it("rejects a turn id without the turn- prefix", () => {
    assert.equal(TurnId.safeParse("0001").success, false);
  });

  it("rejects a turn id with fewer than 4 digits", () => {
    assert.equal(TurnId.safeParse("turn-abc").success, false);
  });

  it("rejects a turn id with non-digit characters", () => {
    assert.equal(TurnId.safeParse("turn-XYZ").success, false);
  });

  it("rejects a non-string", () => {
    assert.equal(TurnId.safeParse(12345).success, false);
  });
});

// ---------------------------------------------------------------------------
// IsoDateTime
// ---------------------------------------------------------------------------
describe("IsoDateTime", () => {
  it("accepts a UTC ISO datetime string", () => {
    assert.ok(IsoDateTime.safeParse("2026-05-04T00:50:02Z").success);
  });

  it("accepts a datetime string with a numeric offset", () => {
    assert.ok(IsoDateTime.safeParse("2026-05-04T00:50:02+05:30").success);
  });

  it("rejects a plain date string", () => {
    assert.equal(IsoDateTime.safeParse("2026-05-04").success, false);
  });

  it("rejects a non-string", () => {
    assert.equal(IsoDateTime.safeParse(1746316202).success, false);
  });
});

// ---------------------------------------------------------------------------
// WorldId
// ---------------------------------------------------------------------------
describe("WorldId", () => {
  it("accepts a valid world id", () => {
    assert.ok(WorldId.safeParse("my-world").success);
  });

  it("accepts a single lowercase letter", () => {
    assert.ok(WorldId.safeParse("a").success);
  });

  it("accepts max-length world id (39 chars)", () => {
    // 1 leading alpha + 38 trailing [a-z0-9-]
    assert.ok(WorldId.safeParse("a" + "b".repeat(38)).success);
  });

  it("rejects a world id starting with a digit", () => {
    assert.equal(WorldId.safeParse("1world").success, false);
  });

  it("rejects a world id exceeding 39 chars", () => {
    assert.equal(WorldId.safeParse("a" + "b".repeat(39)).success, false);
  });

  it("rejects a world id with uppercase letters", () => {
    assert.equal(WorldId.safeParse("MyWorld").success, false);
  });

  it("rejects a non-string", () => {
    assert.equal(WorldId.safeParse(null).success, false);
  });
});

// ---------------------------------------------------------------------------
// SceneId
// ---------------------------------------------------------------------------
describe("SceneId", () => {
  it("accepts a valid scene id", () => {
    assert.ok(SceneId.safeParse("tavern-scene").success);
  });

  it("rejects a scene id starting with a hyphen", () => {
    assert.equal(SceneId.safeParse("-scene").success, false);
  });

  it("rejects a scene id exceeding 39 chars", () => {
    assert.equal(SceneId.safeParse("a" + "b".repeat(39)).success, false);
  });

  it("rejects a non-string", () => {
    assert.equal(SceneId.safeParse(42).success, false);
  });

  it("error message identifies SceneId (not WorldId)", () => {
    const result = SceneId.safeParse("-bad");
    assert.equal(result.success, false);
    assert.ok(result.error.issues[0].message.includes("SceneId"));
  });
});

// ---------------------------------------------------------------------------
// CharacterId
// ---------------------------------------------------------------------------
describe("CharacterId", () => {
  it("accepts a valid character id", () => {
    assert.ok(CharacterId.safeParse("hero").success);
  });

  it("accepts a max-length character id (32 chars)", () => {
    // 1 leading alpha + 31 trailing [a-z0-9-]
    assert.ok(CharacterId.safeParse("a" + "b".repeat(31)).success);
  });

  it("rejects a character id exceeding 32 chars", () => {
    assert.equal(CharacterId.safeParse("a" + "b".repeat(32)).success, false);
  });

  it("rejects a character id starting with a digit", () => {
    assert.equal(CharacterId.safeParse("1hero").success, false);
  });

  it("rejects a non-string", () => {
    assert.equal(CharacterId.safeParse(false).success, false);
  });
});

// ---------------------------------------------------------------------------
// CragSlug
// ---------------------------------------------------------------------------
describe("CragSlug", () => {
  it("accepts a valid crag slug", () => {
    assert.ok(CragSlug.safeParse("my-crag").success);
  });

  it("accepts a slug starting with a digit", () => {
    assert.ok(CragSlug.safeParse("9lives").success);
  });

  it("accepts a max-length crag slug (25 chars)", () => {
    // 1 leading alphanumeric + 24 trailing [a-z0-9_-]
    assert.ok(CragSlug.safeParse("a" + "b".repeat(24)).success);
  });

  it("rejects a crag slug starting with a hyphen", () => {
    assert.equal(CragSlug.safeParse("-crag").success, false);
  });

  it("rejects a crag slug exceeding 25 chars", () => {
    assert.equal(CragSlug.safeParse("a" + "b".repeat(25)).success, false);
  });

  it("rejects a crag slug with uppercase letters", () => {
    assert.equal(CragSlug.safeParse("MyCrag").success, false);
  });

  it("rejects a non-string", () => {
    assert.equal(CragSlug.safeParse({}).success, false);
  });
});

// ---------------------------------------------------------------------------
// TalentName
// ---------------------------------------------------------------------------
describe("TalentName", () => {
  it("accepts a valid talent name", () => {
    assert.ok(TalentName.safeParse("my-talent").success);
  });

  it("accepts a talent name starting with a digit", () => {
    assert.ok(TalentName.safeParse("42nd-talent").success);
  });

  it("accepts a max-length talent name (33 chars)", () => {
    // 1 leading alphanumeric + 32 trailing [a-z0-9_-]
    assert.ok(TalentName.safeParse("a" + "b".repeat(32)).success);
  });

  it("rejects a talent name exceeding 33 chars", () => {
    assert.equal(TalentName.safeParse("a" + "b".repeat(33)).success, false);
  });

  it("rejects a talent name starting with an underscore", () => {
    assert.equal(TalentName.safeParse("_talent").success, false);
  });

  it("rejects a talent name with uppercase letters", () => {
    assert.equal(TalentName.safeParse("MyTalent").success, false);
  });

  it("rejects a non-string", () => {
    assert.equal(TalentName.safeParse([]).success, false);
  });
});

// ---------------------------------------------------------------------------
// InstanceId
// ---------------------------------------------------------------------------
describe("InstanceId", () => {
  it("accepts a valid instance id starting with a letter", () => {
    assert.ok(InstanceId.safeParse("my-instance").success);
  });

  it("accepts a valid instance id starting with a digit", () => {
    assert.ok(InstanceId.safeParse("0instance").success);
  });

  it("accepts a single alphanumeric character", () => {
    assert.ok(InstanceId.safeParse("a").success);
  });

  it("accepts max-length instance id (39 chars)", () => {
    // 1 leading alphanumeric + 38 trailing [a-z0-9-]
    assert.ok(InstanceId.safeParse("a" + "b".repeat(38)).success);
  });

  it("rejects an instance id exceeding 39 chars", () => {
    assert.equal(InstanceId.safeParse("a" + "b".repeat(39)).success, false);
  });

  it("rejects an instance id starting with a hyphen", () => {
    assert.equal(InstanceId.safeParse("-instance").success, false);
  });

  it("rejects an instance id with uppercase letters", () => {
    assert.equal(InstanceId.safeParse("MyInstance").success, false);
  });

  it("rejects an instance id with underscores", () => {
    assert.equal(InstanceId.safeParse("my_instance").success, false);
  });

  it("rejects a non-string", () => {
    assert.equal(InstanceId.safeParse(42).success, false);
  });
});

// ---------------------------------------------------------------------------
// schemaVersion helper
// ---------------------------------------------------------------------------
describe("schemaVersion", () => {
  it("accepts the exact literal version string", () => {
    const v1 = schemaVersion("v1");
    assert.ok(v1.safeParse("v1").success);
  });

  it("rejects a different version string", () => {
    const v1 = schemaVersion("v1");
    assert.equal(v1.safeParse("v2").success, false);
  });

  it("rejects a non-string", () => {
    const v1 = schemaVersion("v1");
    assert.equal(v1.safeParse(1).success, false);
  });

  it("preserves the literal type (v2 schema rejects v1 string)", () => {
    const v2 = schemaVersion("v2");
    assert.equal(v2.safeParse("v1").success, false);
  });
});
