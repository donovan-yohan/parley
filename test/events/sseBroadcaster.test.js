import assert from "node:assert/strict";
import test from "node:test";

import {
  subscribe,
  publish,
  _resetForTests,
  _subscriberCount
} from "../../src/runtime/events/sseBroadcaster.js";

test("subscribe + publish: write called with correctly formatted SSE payload", (t) => {
  _resetForTests();
  const received = [];
  const unsubscribe = subscribe({ storyId: "story-1", write: (payload) => received.push(payload) });

  const event = { type: "scene_opened", emitted_at: "2026-05-04T00:00:00.000Z", inputs: { sceneId: "tavern" } };
  publish({ storyId: "story-1", event });

  assert.equal(received.length, 1);
  assert.equal(received[0], `data: ${JSON.stringify(event)}\n\n`);

  unsubscribe();
  _resetForTests();
});

test("two subscribers same storyId: both receive the event", () => {
  _resetForTests();
  const received1 = [];
  const received2 = [];
  const unsub1 = subscribe({ storyId: "story-2", write: (p) => received1.push(p) });
  const unsub2 = subscribe({ storyId: "story-2", write: (p) => received2.push(p) });

  const event = { type: "npc_spawned", emitted_at: "2026-05-04T00:00:00.000Z", refs: { npcId: "mara" } };
  publish({ storyId: "story-2", event });

  assert.equal(received1.length, 1);
  assert.equal(received2.length, 1);
  assert.equal(received1[0], received2[0]);

  unsub1();
  unsub2();
  _resetForTests();
});

test("different storyIds are isolated: only matching subscribers receive", () => {
  _resetForTests();
  const receivedA = [];
  const receivedB = [];
  const unsubA = subscribe({ storyId: "story-A", write: (p) => receivedA.push(p) });
  const unsubB = subscribe({ storyId: "story-B", write: (p) => receivedB.push(p) });

  const event = { type: "turn_end", emitted_at: "2026-05-04T00:00:00.000Z" };
  publish({ storyId: "story-A", event });

  assert.equal(receivedA.length, 1);
  assert.equal(receivedB.length, 0);

  unsubA();
  unsubB();
  _resetForTests();
});

test("unsubscribe stops further publishes", () => {
  _resetForTests();
  const received = [];
  const unsubscribe = subscribe({ storyId: "story-3", write: (p) => received.push(p) });

  const event1 = { type: "turn_start", emitted_at: "2026-05-04T00:00:00.000Z" };
  publish({ storyId: "story-3", event: event1 });
  assert.equal(received.length, 1);

  unsubscribe();

  const event2 = { type: "turn_end", emitted_at: "2026-05-04T00:00:01.000Z" };
  publish({ storyId: "story-3", event: event2 });
  assert.equal(received.length, 1, "should not receive events after unsubscribing");

  _resetForTests();
});

test("subscriber whose write throws does not break sibling subscribers", () => {
  _resetForTests();
  const received = [];
  const unsubBad = subscribe({
    storyId: "story-4",
    write: () => { throw new Error("network failure"); }
  });
  const unsubGood = subscribe({ storyId: "story-4", write: (p) => received.push(p) });

  const event = { type: "scene_opened", emitted_at: "2026-05-04T00:00:00.000Z" };
  assert.doesNotThrow(() => publish({ storyId: "story-4", event }));
  assert.equal(received.length, 1, "good subscriber should still receive the event");

  unsubBad();
  unsubGood();
  _resetForTests();
});

test("_subscriberCount reflects current state", () => {
  _resetForTests();
  assert.equal(_subscriberCount("story-5"), 0);

  const unsub1 = subscribe({ storyId: "story-5", write: () => {} });
  assert.equal(_subscriberCount("story-5"), 1);

  const unsub2 = subscribe({ storyId: "story-5", write: () => {} });
  assert.equal(_subscriberCount("story-5"), 2);

  unsub1();
  assert.equal(_subscriberCount("story-5"), 1);

  unsub2();
  assert.equal(_subscriberCount("story-5"), 0);

  _resetForTests();
});

test("_resetForTests clears all subscribers", () => {
  _resetForTests();
  subscribe({ storyId: "story-6", write: () => {} });
  subscribe({ storyId: "story-7", write: () => {} });

  assert.equal(_subscriberCount("story-6"), 1);
  assert.equal(_subscriberCount("story-7"), 1);

  _resetForTests();

  assert.equal(_subscriberCount("story-6"), 0);
  assert.equal(_subscriberCount("story-7"), 0);
});

test("publish to storyId with no subscribers is a no-op", () => {
  _resetForTests();
  const event = { type: "turn_start", emitted_at: "2026-05-04T00:00:00.000Z" };
  assert.doesNotThrow(() => publish({ storyId: "nonexistent-story", event }));
  _resetForTests();
});

test("dead subscriber (write throws) is removed from Set after first publish", () => {
  _resetForTests();
  let callCount = 0;
  subscribe({
    storyId: "story-dead",
    write: () => {
      callCount++;
      throw new Error("connection closed");
    },
  });

  assert.equal(_subscriberCount("story-dead"), 1);

  const event1 = { type: "turn_start", emitted_at: "2026-05-04T00:00:00.000Z" };
  assert.doesNotThrow(() => publish({ storyId: "story-dead", event: event1 }));

  // After first publish the dead subscriber must have been removed.
  assert.equal(_subscriberCount("story-dead"), 0, "dead subscriber should be removed after first publish");

  const event2 = { type: "turn_end", emitted_at: "2026-05-04T00:00:01.000Z" };
  assert.doesNotThrow(() => publish({ storyId: "story-dead", event: event2 }));

  // write was only called once (on the first publish, not the second)
  assert.equal(callCount, 1, "dead subscriber write should not be called again after removal");

  _resetForTests();
});
