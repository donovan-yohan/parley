---
schema_version: parley-visual-prompt/v1
asset_id: portrait:innkeeper-borvyn
asset_kind: portrait
entity_id: innkeeper-borvyn
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
solid character design, clear silhouette, visible brushwork. Deep navy/purple
background with warm candlelight from one side.

## Character

Name: Innkeeper Borvyn
Role: Innkeeper of the Gilded Eaves
Scene: The Gilded Eaves inn, evening — behind or beside the bar
Tone: cautious-hospitable

## Physical Description / Stable Visual Traits

- status: draft
- age range: late fifties
- build: stocky and broad-shouldered; the kind of build that moves barrels without
  thinking about it
- physical description: close-cropped grey hair; a neat, well-maintained beard going
  white at the chin; deep-set brown eyes that are professionally warm and privately
  calculating; hands large and calloused from decades of work
- wardrobe: dark wool vest over a clean linen shirt; no apron (he is the owner, not
  the barkeep); a ring of iron keys hanging at his belt; one ring on his right hand
  (old gold, plain band)
- signature props: ring of keys; a heavy pewter cup he holds or sets on the bar
- palette hints: warm candlelight from the right; deep navy/purple shadow behind;
  ivory highlights on face and shirt; gold from the key ring and the inn's sconces
- negative: no armor; no noble court finery; no modern zippers; no modern hairstyle

## Composition

Bust portrait, shoulders-up. The subject is behind or beside the bar — a heavy oak
surface at frame bottom hints at this. Candlelight from the right. Expression is the
practiced hospitality of someone who knows exactly how much to reveal. Specific,
lived-in face. No baked-in text, labels, UI, or story spoilers.

## Negative Constraints

- no armor
- no noble finery
- no modern styling
- no readable text
- no UI chrome
- no generic stock portrait
