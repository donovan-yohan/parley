import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeProfilePrivate } from "../../src/runtime/tools/profilePrivateWriter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock belayerProcess that records calls and returns a canned result. */
function makeMockBelayer({ ok = true, messageId = "msg-abc123" } = {}) {
  const calls = [];
  const belayerProcess = {
    mailSend: async (args) => {
      calls.push(args);
      return { ok, messageId };
    }
  };
  return { belayerProcess, calls };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe("writeProfilePrivate — happy path", () => {
  it("calls mailSend with the correct arguments and returns ok + messageId", async () => {
    const { belayerProcess, calls } = makeMockBelayer({ ok: true, messageId: "msg-001" });

    const result = await writeProfilePrivate({
      cragSlug: "my-instance",
      characterId: "innkeeper",
      toolName: "remember_private",
      inputs: { content: "The player trusted me." },
      storyId: "story-42",
      belayerProcess
    });

    assert.equal(result.ok, true);
    assert.equal(result.messageId, "msg-001");
    assert.equal(calls.length, 1);

    const call = calls[0];
    assert.equal(call.cragSlug, "my-instance");
    assert.equal(call.talentName, "innkeeper");
    assert.ok(typeof call.clientEventId === "string", "clientEventId should be a string");
    assert.ok(call.clientEventId.startsWith("private-story-42-innkeeper-"), "clientEventId prefix");
  });

  it("serializes inputs into the body as JSON", async () => {
    const { belayerProcess, calls } = makeMockBelayer();

    await writeProfilePrivate({
      cragSlug: "my-instance",
      characterId: "guard",
      toolName: "set_intention",
      inputs: { goal: "protect the vault", priority: "high" },
      storyId: "story-99",
      belayerProcess
    });

    const call = calls[0];
    const body = JSON.parse(call.body);

    assert.equal(body.schema_version, "parley-private-memory/v1");
    assert.equal(body.story_id, "story-99");
    assert.equal(body.tool, "set_intention");
    assert.deepEqual(body.inputs, { goal: "protect the vault", priority: "high" });
    assert.ok(typeof body.written_at === "string", "written_at should be a string");
  });

  it("includes story_id in serialized body", async () => {
    const { belayerProcess, calls } = makeMockBelayer();

    await writeProfilePrivate({
      cragSlug: "crag-x",
      characterId: "merchant",
      toolName: "revise_belief",
      inputs: { belief: "The duke is corrupt." },
      storyId: "story-special",
      belayerProcess
    });

    const body = JSON.parse(calls[0].body);
    assert.equal(body.story_id, "story-special");
  });
});

// ---------------------------------------------------------------------------
// D5 enforcement: storyId required
// ---------------------------------------------------------------------------
describe("writeProfilePrivate — D5 story_id enforcement", () => {
  it("throws when storyId is missing (undefined)", async () => {
    const { belayerProcess } = makeMockBelayer();

    await assert.rejects(
      () =>
        writeProfilePrivate({
          cragSlug: "crag",
          characterId: "npc",
          toolName: "remember_private",
          inputs: {},
          storyId: undefined,
          belayerProcess
        }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("story_id is required"),
          `Expected D5 message, got: ${err.message}`
        );
        return true;
      }
    );
  });

  it("throws when storyId is null", async () => {
    const { belayerProcess } = makeMockBelayer();

    await assert.rejects(
      () =>
        writeProfilePrivate({
          cragSlug: "crag",
          characterId: "npc",
          toolName: "remember_private",
          inputs: {},
          storyId: null,
          belayerProcess
        }),
      /story_id is required/
    );
  });

  it("throws when storyId is an empty string", async () => {
    const { belayerProcess } = makeMockBelayer();

    await assert.rejects(
      () =>
        writeProfilePrivate({
          cragSlug: "crag",
          characterId: "npc",
          toolName: "remember_private",
          inputs: {},
          storyId: "",
          belayerProcess
        }),
      /story_id is required/
    );
  });

  it("does NOT call mailSend when storyId is missing", async () => {
    const { belayerProcess, calls } = makeMockBelayer();

    try {
      await writeProfilePrivate({
        cragSlug: "crag",
        characterId: "npc",
        toolName: "remember_private",
        inputs: {},
        storyId: undefined,
        belayerProcess
      });
    } catch {
      // expected
    }

    assert.equal(calls.length, 0, "mailSend must not be called when storyId is missing");
  });
});
