import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function buildScenarioCharacter({ scenario, characterDefinition, sourceRequest, scene = scenario.scene }) {
  const tags = [
    ...(characterDefinition.tags ?? []),
    `scene:${scene.id}`
  ];

  return {
    schema_version: "parley-character/v1",
    id: characterDefinition.id,
    name: characterDefinition.name,
    reusable: characterDefinition.reusable ?? true,
    lifecycle: characterDefinition.lifecycle ?? "resumable",
    tags: [...new Set(tags)],
    world: characterDefinition.world ?? scenario.world.id,
    scene: scene.id,
    role: characterDefinition.role,
    faction: characterDefinition.faction,
    tone: characterDefinition.tone,
    importance: characterDefinition.importance,
    knowledgeBoundary: characterDefinition.knowledgeBoundary,
    visual: characterDefinition.visual,
    belayerGeneratedTalent: {
      schema_version: "belayer-generated-talent/v1",
      id: characterDefinition.id,
      domain: "story",
      role: characterDefinition.role,
      lifecycle: characterDefinition.lifecycle ?? "resumable",
      status: "generated",
      source_request: sourceRequest,
      metadata: {
        faction: characterDefinition.faction,
        tone: characterDefinition.tone,
        importance: characterDefinition.importance,
        knowledge_boundary: characterDefinition.knowledgeBoundary
      }
    },
    portrait: characterDefinition.portrait ?? {
      status: "missing"
    }
  };
}

export function buildMaraUnderbough({ scene, sourceRequest }) {
  return buildScenarioCharacter({
    scene,
    sourceRequest,
    scenario: {
      world: { id: "last-lantern" },
      scene
    },
    characterDefinition: {
      id: "mara-underbough",
      name: "Mara Underbough",
      role: "tavernkeep",
      reusable: true,
      lifecycle: "resumable",
      world: "last-lantern",
      faction: "last-lantern-staff",
      tone: "warm-watchful",
      importance: "recurring",
      knowledgeBoundary: "Knows local rumors and visible tavern history, not author-only hidden truth.",
      tags: [
        "location:last-lantern-tavern",
        "role:tavernkeep",
        "importance:recurring",
        "faction:last-lantern-staff",
        "tone:warm-watchful"
      ],
      portrait: {
      status: "missing",
      prompt_path: "worlds/last-lantern/characters/mara-underbough.md#portrait-prompt",
      asset_path: "worlds/last-lantern/assets/portraits/mara-underbough.png"
    }
    }
  });
}

export async function persistCharacterMarkdown({ character, worldDir }) {
  const charactersDir = path.join(worldDir, "characters");
  await mkdir(charactersDir, { recursive: true });

  const content = `# ${character.name}

Schema: \`${character.schema_version}\`

${character.name} is a reusable Parley character backed by a Belayer generated
talent record. Parley owns the story-facing metadata below; Belayer only sees
the generic generated-talent fields.

## Tags

${character.tags.map((tag) => `- \`${tag}\``).join("\n")}

## Belayer Generated Talent Mapping

- id: \`${character.belayerGeneratedTalent.id}\`
- domain: \`${character.belayerGeneratedTalent.domain}\`
- role: \`${character.belayerGeneratedTalent.role}\`
- lifecycle: \`${character.belayerGeneratedTalent.lifecycle}\`
- status: \`${character.belayerGeneratedTalent.status}\`
- source_request: \`${character.belayerGeneratedTalent.source_request}\`

## Knowledge Boundary

${character.belayerGeneratedTalent.metadata.knowledge_boundary}

## Visual Profile

${formatVisualMarkdown(character.visual)}

## Portrait Prompt

Portrait metadata is tracked in the character record:

- status: \`${character.portrait?.status ?? "missing"}\`
- prompt_path: \`${character.portrait?.prompt_path ?? "not-set"}\`
- asset_path: \`${character.portrait?.asset_path ?? "not-set"}\`

Do not imply the character knows hidden author-only truth.
`;

  try {
    await writeFile(path.join(charactersDir, `${character.id}.md`), content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

function formatVisualMarkdown(visual) {
  if (!visual) {
    return "Visual traits have not been drafted yet.";
  }

  return Object.entries(visual)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join("; ") : String(value)}`)
    .join("\n");
}
