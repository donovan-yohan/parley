import path from "node:path";

const VALID_SEGMENT = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/**
 * Throws if `storyId` is not safe to use as a single filesystem path segment.
 * Rejects: empty, contains '/', '\', '..', leading '.', or non-conforming chars.
 */
export function assertSafeStoryIdSegment(storyId) {
  if (typeof storyId !== "string" || storyId.length === 0) {
    throw new Error("storyId must be a non-empty string");
  }
  if (storyId.includes("/") || storyId.includes("\\") || storyId.includes("..")) {
    throw new Error(`storyId contains unsafe path characters: ${storyId}`);
  }
  if (storyId.startsWith(".")) {
    throw new Error(`storyId must not start with '.': ${storyId}`);
  }
  if (!VALID_SEGMENT.test(storyId)) {
    throw new Error(`storyId must match ${VALID_SEGMENT}: ${storyId}`);
  }
}
