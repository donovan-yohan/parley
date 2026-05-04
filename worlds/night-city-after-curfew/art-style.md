# Art Style — Night City After Curfew

## Design Philosophy

Midnight megacity neon-noir. The visual language borrows from HUD overlays,
AR interfaces, and glitch aesthetics. Everything is either pitch-black or
neon-bright — no midtones, no mercy.

## Color System

| Role        | Value          | Usage                            |
|-------------|----------------|----------------------------------|
| Background  | `#0a0a0f`      | Pure near-black void             |
| Midground   | `#3d0a3d`      | Deep magenta — corp authority    |
| Foreground  | `#00f0ff`      | Cyan — data, interface, player   |
| Accent      | `#ff00c8`      | Magenta — danger, NPC speech     |
| Warm glow   | `rgba(255,0,200,0.4)` | Bloom on neon elements  |

## Typography

- **Display**: Orbitron — uppercase, wide letter-spacing. Used for world
  title, headings, HUD labels. Conveys corporate technical authority.
- **Mono**: Share Tech Mono — all body text, transcript, input fields.
  Every character is a data stream.
- **Fallback**: Inter — body text in accessibility contexts.

## Signature Elements

### Scanlines
Thin repeating horizontal lines (1px every 4px), animating slowly downward.
Evoke CRT monitors and surveillance feeds. Applied as a fixed overlay with
`mix-blend-mode: overlay` so they don't obscure content.

### Notched Corners (clip-path)
Cards, dialogue boxes, and buttons use `clip-path: polygon(...)` to cut the
bottom-right corner. Signature angular HUD aesthetic — no soft borders.

### Glitch Animation
The L3 story title glitches: momentary red/cyan channel-split text-shadow +
1–2px translate shift. Fires every ~6 seconds on a CSS keyframe loop.

### Holographic Shimmer
Choice buttons have a moving gradient overlay (transparent → cyan → magenta
→ transparent) on a 3s loop. Simulates holographic film.

### Neon Glow
Cyan elements glow via `text-shadow` and `box-shadow`. Focused inputs emit a
12px outer glow. Speaker labels have magenta bloom.

## UI Layout — HUD Mode

The L2 world home shows:
1. Thin stat bar at top (system uptime ticker, zone ID)
2. Nav row with "Jack Out" button + world title
3. Story groups as angular neon-bordered cards

The L3 story play shows:
1. Same stat bar (turn counter, mission codename)
2. Transcript in full-bleed black with neon grid overlay
3. Speaker dialogue in magenta-bordered angular boxes
4. Input at bottom with neon-glow focus

## Asset Pipeline

Background and portrait images use the `.prompt.md` placeholder format.
Actual generation is future work; theme palette provides the backdrop fallback.

Recommend generation style: wide-format matte painting, ultra-detailed
megacity nightscape with neon advertisement panels, rain-slicked streets,
elevated maglev rails. No visible faces. Safe overlay zone: lower third.
