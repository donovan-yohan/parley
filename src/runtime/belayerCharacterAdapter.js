import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function buildMaraUnderbough({ scene, sourceRequest }) {
  const tags = [
    "location:last-lantern-tavern",
    "role:tavernkeep",
    "importance:recurring",
    "faction:last-lantern-staff",
    `scene:${scene.id}`,
    "tone:warm-watchful"
  ];

  return {
    schema_version: "parley-character/v1",
    id: "mara-underbough",
    name: "Mara Underbough",
    reusable: true,
    lifecycle: "resumable",
    tags,
    world: "last-lantern",
    scene: scene.id,
    belayerGeneratedTalent: {
      schema_version: "belayer-generated-talent/v1",
      id: "mara-underbough",
      domain: "story",
      role: "tavernkeep",
      lifecycle: "resumable",
      status: "generated",
      source_request: sourceRequest,
      metadata: {
        voice: "warm and watchful",
        knowledge_boundary: "Knows local rumors and visible tavern history, not author-only hidden truth."
      }
    },
    portrait: {
      status: "missing",
      prompt_path: "worlds/last-lantern/characters/mara-underbough.md#portrait-prompt",
      asset_path: "worlds/last-lantern/assets/portraits/mara-underbough.png"
    }
  };
}

export async function persistCharacterMarkdown({ character, worldDir }) {
  const charactersDir = path.join(worldDir, "characters");
  await mkdir(charactersDir, { recursive: true });

  const content = `# ${character.name}

Schema: \`${character.schema_version}\`

Mara Underbough is a reusable Parley character backed by a Belayer generated
talent record. Parley owns the story-facing metadata below; Belayer only needs
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

## Portrait Prompt

Use \`worlds/last-lantern/art-style.md\` as the style source. Portrait should
show a middle-aged tavernkeep with practical clothes, lamplight on weathered
wood, and a warm but watchful expression. Do not imply she knows hidden
author-only truth.
`;

  try {
    await writeFile(path.join(charactersDir, `${character.id}.md`), content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}
