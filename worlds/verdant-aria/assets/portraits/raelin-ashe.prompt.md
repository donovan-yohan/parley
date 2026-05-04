---
schema_version: parley-visual-prompt/v1
asset_id: portrait:raelin-ashe
asset_kind: portrait
entity_id: raelin-ashe
world: verdant-aria
aspect_ratio: portrait
tool: hermes.image_generate
---

# Hermes image_generate request

Call image_generate with aspect_ratio="portrait" after reviewing this prompt. Do not
bind Parley to any backend-specific API; Hermes owns the image generation provider.

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

Ornate hand-painted fantasy. Jewel-toned palette. SNES-era JRPG portrait weight —
expressive, clean, with visible brushwork. Deep navy background with candlelight
from below and to one side.

## Character

Name: Raelin Ashe
Role: Wandering bard
Scene: The Gilded Eaves inn, evening
Tone: curious-melancholy

## Physical Description / Stable Visual Traits

- status: draft
- age range: mid-twenties to mid-thirties; ambiguous enough to have traveled widely
- build: lean, with the posture of someone used to carrying an instrument
- physical description: expressive eyes, slightly windburned complexion, dark hair
  worn practical (tied back or short), a small scar on one hand from a string break
- wardrobe: travel doublet in dark burgundy or forest green; one sleeve rolled to
  the elbow; a battered lute strap visible at the shoulder; a worn leather satchel
  buckle at the edge of frame
- signature props: lute strap or tuning peg in one hand; small notebook or rolled
  parchment at belt
- palette hints: deep navy background; warm candlelight from below; ivory/parchment
  highlights on face and hand; gold accent on belt or ring
- negative: no heavy armor; no noble court finery; no modern styling

## Composition

Bust portrait, shoulders-up. Candlelight from below-left. Specific and lived-in face.
The expression is caught between professional warmth (the bard's performance face)
and something more private — someone who has heard one song too many that named real
people. No baked-in text, labels, UI, or story spoilers.

## Negative Constraints

- no armor or weapons
- no noble finery
- no modern styling
- no readable text
- no UI chrome
- no generic stock portrait
