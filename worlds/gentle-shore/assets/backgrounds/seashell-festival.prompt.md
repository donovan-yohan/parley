---
schema_version: parley-visual-prompt/v1
asset_id: background:seashell-festival
asset_kind: background
entity_id: seashell-festival
world: gentle-shore
aspect_ratio: landscape
tool: hermes.image_generate
---

# Hermes image_generate request

Call image_generate with aspect_ratio="landscape". This must be a reusable visual novel background, not a per-turn illustration.

## World Art Style

---
schema_version: parley-art-style/v1
world: gentle-shore
default_seed_strategy: stable-per-entity
portrait:
  aspect_ratio: portrait
  framing: warm bust portrait, shoulders-up, soft natural light
background:
  aspect_ratio: landscape
  framing: visual novel background, gentle coastal composition
  safe_overlay_zones:
    - bottom third
    - center lower third
---

## Style

Warm watercolor illustration with a hand-painted coastal quality. Gentle, unhurried. Golden-hour soft light. Brushwork visible in edges and textures. Think picture-book illustration with a little more detail and weight than pure flat color.

## Palette

Peach-cream, soft sage green, warm sand, driftwood brown, sky blue that never goes cold. Sunlight on everything. Shadows are warm, never grey-blue.

## Location / Scene

Location: Seashell Festival Green, Gentle Shore
World: Gentle Shore
Premise: A seaside village prepares its annual seashell festival where every neighbor has a story and a small worry.

## Visual Novel Background Requirements

- status: draft
- environment type: outdoor coastal festival green in afternoon light
- time of day: golden afternoon, no more than two hours before sunset
- composition: wide establishing shot of a festival green running from a high street with cottage storefronts toward a cliff edge with a harbor glimpse beyond; festival stalls visible along the left; open grass in the center; a tide-pool path splitting off at mid-frame right
- landmarks: sage-and-cream festival banners strung between posts; shell-painting station with a rack of painted shells; a folding table with lemonade; distant harbor visible at cliff edge
- safe overlay zones: bottom third; center lower third
- negative: no visible player character; no readable text/signage; no UI elements

Wide establishing composition. No player character visible. Keep the bottom third and center lower third low-noise so Parley's transcript/input overlay remains readable. Seashells and garland as decorative motifs. Do not bake text, labels, UI panels, or logos into the image.

## Negative Constraints

- no visible player character
- no readable text or signage
- no UI elements
- no modern vehicles
- no generic empty beach with nothing happening
- no stormy or overcast sky
- no fantasy elements
