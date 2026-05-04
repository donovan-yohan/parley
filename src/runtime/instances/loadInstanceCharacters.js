/**
 * loadInstanceCharacters.js
 *
 * Loads materialized character records from an instance directory.
 * Reads character markdown files from <instanceDir>/world/characters/*.md,
 * parses optional YAML frontmatter, and builds character objects matching the
 * shape produced by buildScenarioCharacter() in belayerCharacterAdapter.js.
 *
 * This is the instance-based code path introduced in PR #12 (AB.8).
 * The legacy inline-build path (buildScenarioCharacter) is retained as a
 * fallback for scenarios not yet materialized into an instance.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a markdown file.
 * Handles simple flat key:value pairs and inline JSON arrays for tags.
 * @param {string} content
 * @returns {{ frontmatter: Record<string, unknown>, body: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const frontmatter = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Handle simple inline JSON arrays for tags
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).split(",").map(v => v.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body: match[2] };
}

// ---------------------------------------------------------------------------
// Prose tags parser (fallback for files without YAML frontmatter)
// ---------------------------------------------------------------------------

/**
 * Parse a `## Tags` section from a prose markdown body.
 * Each line of the form `- \`tag:value\`` contributes a tag.
 * Also extracts `role` if a tag entry of the form `role:<name>` is present.
 *
 * @param {string} body - Markdown body (no frontmatter)
 * @returns {{ tags: string[], role: string | undefined }}
 */
function parseProseTags(body) {
  const tags = [];
  let role;

  // Find the ## Tags section (capture until the next ## heading or end of string)
  const tagsMatch = body.match(/^##\s+Tags\s*\n([\s\S]*?)(?=^##\s|\Z)/m);
  if (!tagsMatch) return { tags, role };

  for (const line of tagsMatch[1].split("\n")) {
    // Match lines like: - `some:tag`
    const tagMatch = line.match(/^-\s+`([^`]+)`/);
    if (!tagMatch) continue;
    const tag = tagMatch[1].trim();
    tags.push(tag);
    if (tag.startsWith("role:")) {
      role = tag.slice("role:".length);
    }
  }

  return { tags, role };
}

// ---------------------------------------------------------------------------
// Humanize helper
// ---------------------------------------------------------------------------

/**
 * Convert a kebab-case id to a human-readable name.
 * E.g. "mara-underbough" → "Mara Underbough"
 * @param {string} id
 * @returns {string}
 */
function humanizeId(id) {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Scene tag overlay helper
// ---------------------------------------------------------------------------

/**
 * Add scene:<sceneId> tag to each character if not already present.
 * Returns a new array — does not mutate the input.
 * @param {Array<object>} characters
 * @param {{ id: string }} scene
 * @returns {Array<object>}
 */
export function applySceneTagOverlay(characters, scene) {
  const sceneTag = `scene:${scene.id}`;
  return characters.map((character) => {
    if (character.tags.includes(sceneTag)) {
      return character;
    }
    return {
      ...character,
      tags: [...character.tags, sceneTag]
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load materialized character records from an instance directory.
 *
 * Reads <instanceDir>/world/characters/*.md. Each .md file represents one
 * character. The filename basename (without .md) is the character id.
 *
 * Parses optional YAML frontmatter (3-dash delimited) for character fields.
 * If frontmatter is absent, uses filename-derived defaults.
 *
 * The returned character objects match the shape produced by buildScenarioCharacter().
 * The scene:<sceneId> tag is automatically applied to each character.
 *
 * @param {object} opts
 * @param {string} opts.instanceDir - Path to the materialized instance directory
 * @param {string} opts.sceneId     - Scene id to attach as a scene:<id> tag
 * @returns {Promise<Array<object>>} Array of character records
 */
export async function loadInstanceCharacters({ instanceDir, sceneId }) {
  const charsDir = path.join(instanceDir, "world", "characters");

  // If the characters directory doesn't exist, return empty array — don't throw.
  let mdFiles;
  try {
    const entries = await readdir(charsDir);
    mdFiles = entries.filter((f) => f.endsWith(".md"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const characters = await Promise.all(
    mdFiles.map((mdFile) => loadCharacterFile({ charsDir, mdFile, sceneId }))
  );

  return characters;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load a single character from a .md file.
 * @param {object} opts
 * @param {string} opts.charsDir - Directory containing character .md files
 * @param {string} opts.mdFile   - Filename (e.g. "mara-underbough.md")
 * @param {string} opts.sceneId  - Scene id for tag overlay
 * @returns {Promise<object>}
 */
async function loadCharacterFile({ charsDir, mdFile, sceneId }) {
  const id = path.basename(mdFile, ".md");
  const content = await readFile(path.join(charsDir, mdFile), "utf8");
  const { frontmatter, body } = parseFrontmatter(content);

  // If no frontmatter, fall back to parsing the prose ## Tags section.
  const hasFrontmatter = Object.keys(frontmatter).length > 0;
  const proseFallback = hasFrontmatter ? { tags: [], role: undefined } : parseProseTags(body);

  const name = frontmatter.name ?? humanizeId(id);
  const role = frontmatter.role ?? proseFallback.role ?? "unspecified";
  const lifecycle = frontmatter.lifecycle ?? "resumable";
  const world = frontmatter.world ?? undefined;
  const faction = frontmatter.faction ?? undefined;
  const tone = frontmatter.tone ?? undefined;
  const importance = frontmatter.importance ?? undefined;
  const knowledgeBoundary = frontmatter.knowledgeBoundary ?? undefined;
  const visual = frontmatter.visual ?? undefined;

  // Build tags: start with frontmatter tags or prose-extracted tags, then add scene tag.
  const baseTags = Array.isArray(frontmatter.tags)
    ? [...frontmatter.tags]
    : [...proseFallback.tags];
  const sceneTag = `scene:${sceneId}`;
  const tags = baseTags.includes(sceneTag) ? baseTags : [...baseTags, sceneTag];

  return {
    schema_version: "parley-character/v1",
    id,
    name,
    reusable: true,
    lifecycle,
    tags,
    world,
    scene: sceneId,
    role,
    faction,
    tone,
    importance,
    knowledgeBoundary,
    visual,
    belayerGeneratedTalent: {
      schema_version: "belayer-generated-talent/v1",
      id,
      domain: "story",
      role,
      lifecycle,
      status: "generated",
      source_request: "instance-load",
      metadata: {
        faction,
        tone,
        importance,
        knowledge_boundary: knowledgeBoundary
      }
    },
    portrait: { status: "missing" }
  };
}
