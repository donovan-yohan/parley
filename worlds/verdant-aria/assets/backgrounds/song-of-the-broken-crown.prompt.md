---
schema_version: parley-visual-prompt/v1
asset_id: background:song-of-the-broken-crown
asset_kind: background
entity_id: song-of-the-broken-crown
world: verdant-aria
aspect_ratio: landscape
tool: hermes.image_generate
---

# Hermes image_generate request

Call image_generate with aspect_ratio="landscape". This must be a reusable visual
novel background, not a per-turn illustration.

## World Art Style

---
schema_version: parley-art-style/v1
world: verdant-aria
default_seed_strategy: stable-per-entity
portrait:
  aspect_ratio: portrait
  framing: bust portrait, shoulders-up
background:
  aspect_ratio: landscape
  framing: visual novel background, clean composition for text overlay
  safe_overlay_zones:
    - bottom third
    - center lower third
---

## Style

Ornate hand-painted fantasy. Rich jewel-toned palette. Inspiration: early SNES-era
JRPG painterly menu screens crossed with illuminated manuscript marginalia. Heavy
wooden architecture, candlelight, heraldic detail. Brushwork visible. Depth through
color temperature, not harsh shadow.

## Palette

Deep navy exterior (#0a0e3d). Royal purple in deep shadows (#5b3387). Ivory and
warm parchment in the candlelit zones (#f5e8c8). Gold accents: border mouldings,
candle flames, hanging sconces (#d4af37). No washed-out midtones.

## Location / Scene

The Gilded Eaves inn common room at dusk. High-beamed ceiling. Stone fireplace on
the far wall, fire burning low. A dozen candles in iron sconces. Heavy oak tables
and benches, mostly occupied by silhouetted figures. A faded heraldic banner hangs
above the fireplace — the kingdom's old crest, partially obscured by a hanging
instrument. Pewter mugs. A wide, arched window in the background showing the last
light of a violet dusk. No characters in frame individually.

## Visual Novel Background Requirements

- status: draft
- environment type: prosperous inn common room interior at dusk
- time of day: early evening, candlelit
- composition: wide establishing shot from the back of the room toward the hearth and
  bar, slightly elevated viewpoint
- landmarks: faded heraldic banner above fireplace; arched window with violet dusk;
  iron sconces with candles; pewter mugs on tables
- safe overlay zones: bottom third; center lower third
- negative: no visible player character; no readable text/signage; no UI elements

Wide establishing composition. No player character visible. Keep the bottom third
and center lower third low-noise so Parley's transcript/input overlay remains readable.
Do not bake text, labels, UI panels, or logos into the image.

## Negative Constraints

- no visible player character
- no readable text or signage
- no UI elements or chrome
- no modern furniture or lighting fixtures
- no identifiable real-world locations
- no photorealistic CG render
