/**
 * aspectRatioMap.js
 *
 * Maps world default_aspect_ratio strings (e.g. "3:4", "16:9", "1:1") to
 * the Hermes image_generate aspect_ratio enum values ("landscape" | "portrait" | "square").
 */

const MAP = {
  "3:4": "portrait",
  "4:3": "landscape",
  "16:9": "landscape",
  "9:16": "portrait",
  "1:1": "square",
};

/**
 * Map a world aspect ratio string to the Hermes enum value.
 *
 * @param {string | undefined | null} worldAspectRatio - e.g. "3:4", "16:9", "1:1"
 * @returns {"landscape" | "portrait" | "square"}
 */
export function mapAspectRatio(worldAspectRatio) {
  if (!worldAspectRatio) return "landscape"; // safe default
  const normalized = String(worldAspectRatio).trim();
  return MAP[normalized] ?? "landscape";
}
