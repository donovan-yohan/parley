// Singleton broadcaster module. Subscribers per storyId.
//
// Scope note: this is local-dev infrastructure. Parley's server binds to
// 127.0.0.1; subscriber count is unbounded by design at this scope. If
// Parley is later exposed beyond localhost, add a per-storyId subscriber
// cap (e.g., 64) and reject new subscriptions over the cap with HTTP 503.

const subscribersByStory = new Map(); // storyId -> Set<{ id, write }>

export function subscribe({ storyId, write }) {
  if (!subscribersByStory.has(storyId)) subscribersByStory.set(storyId, new Set());
  const sub = { id: `sub-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, write };
  subscribersByStory.get(storyId).add(sub);
  return () => {
    subscribersByStory.get(storyId)?.delete(sub);
    if (subscribersByStory.get(storyId)?.size === 0) subscribersByStory.delete(storyId);
  };
}

export function publish({ storyId, event }) {
  const subs = subscribersByStory.get(storyId);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const sub of subs) {
    try { sub.write(payload); } catch { /* drop dead subscribers silently */ }
  }
}

export function _resetForTests() {
  subscribersByStory.clear();
}

export function _subscriberCount(storyId) {
  return subscribersByStory.get(storyId)?.size ?? 0;
}
