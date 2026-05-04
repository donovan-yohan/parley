# Parley Portrait Seam — Hermes Image-Gen Integration

> **STATUS:** The image-gen seam described here is implemented in PR #25 via
> the `portrait-artist` and `background-artist` Belayer talents, which call
> Hermes `image_generate` directly. The "MVP Stub Behavior" section at the
> bottom is superseded — image generation is live when a Hermes image provider
> is configured. See `docs/plans/2026-05-04-belayer-profile-coupling.md` for
> the as-shipped scope.

## Purpose

Defines how a Parley character gets a portrait. MVP does not call image-gen.
This doc fixes the contract so the runtime can stub portraits today and swap in
Hermes image-gen later without schema churn.

## Status Machine

```
missing  ──compose──▶  prompt_ready  ──generate──▶  generated  ──approve──▶  locked
```

| Status         | Meaning                                                                    |
|----------------|----------------------------------------------------------------------------|
| `missing`      | Character exists. No prompt, no asset.                                     |
| `prompt_ready` | Prompt composed and persisted. No image yet.                               |
| `generated`    | Image exists at `asset_path`. May be regenerated.                          |
| `locked`       | Human-approved. Pipeline must not overwrite. Used for key recurring NPCs.  |

The character record carries the current status; transitions are events on
`log.md`.

## Prompt Composition

Prompts are assembled, not free-formed. Composition order is fixed so the same
inputs produce the same prompt:

1. World style header — read from `worlds/<w>/art-style.md`
2. Character visual traits — from character page `visual` block
3. Role + location tags — from character `tags`
4. Mood / tone — from character `tags.tone` and active scene `tone`
5. Negative prompt / consistency notes — world style negatives + character
   negatives
6. Seed and aspect ratio — from character `portrait.seed` + world default

Persisted as a sidecar Markdown file so humans can read it:

`worlds/<w>/assets/portraits/<id>.prompt.md`

```markdown
---
character_id: mara-underbough
world: last-lantern
composer_version: 1
seed: 17492
aspect_ratio: "3:4"
---

## Style
{{ contents of art-style.md style block }}

## Subject
{{ character visual block }}

## Context
{{ role + primary location + tone tags }}

## Negative
{{ world negatives + character negatives }}
```

The `.prompt.md` file is the prompt. Anything calling image-gen reads this
file. No prompt strings live inside runtime code.

## Character `visual` Block

Added to character pages alongside `tags` and `knowledge_scope`:

```yaml
visual:
  age_range: "50s"
  build: "stout, broad-shouldered"
  features:
    - "ash-grey hair pulled back"
    - "burn scar across left forearm"
    - "ink-stained apron"
  wardrobe: "wool tunic, leather apron, copper key on a thong"
  signature: "carries a chipped blue bowl"
  negatives:
    - "no anachronistic clothing"
    - "no medieval armor — she is a tavernkeep"
```

Short, visual, repeatable. Not a personality dump.

## World `art-style.md`

Single source of truth for world look. Frontmatter is machine-readable; body
is the prose the prompt composer pastes verbatim.

```markdown
---
schema_version: parley-art-style/v1
world: last-lantern
default_aspect_ratio: "3:4"
default_seed_strategy: "stable-per-character"
---

## Style
Grounded fantasy. Painted with weight. Lantern-lit, rain-soft.
Reference: late-1800s tavern interiors crossed with early-modern oil portrait.
Color: warm umber, rust, lamp-yellow, cold blue night through windows.

## Negative
No glossy CG. No anime. No cape-and-armor heroics.
No modern eyewear or zippers. No identifiable real-world celebrities.
```

## Generation Contract

Image-gen call surface (Hermes-shaped, but the runtime should treat it as a
generic interface so any provider works):

```yaml
generate_portrait:
  input:
    prompt_path: worlds/last-lantern/assets/portraits/mara-underbough.prompt.md
    seed: 17492
    aspect_ratio: "3:4"
    target_path: worlds/last-lantern/assets/portraits/mara-underbough.png
  output:
    asset_path: worlds/last-lantern/assets/portraits/mara-underbough.png
    provider: hermes-image-gen
    provider_version: <semver>
    generated_at: <iso8601>
```

After success the runtime updates the character record:

```yaml
portrait:
  status: generated
  prompt_path: worlds/last-lantern/assets/portraits/mara-underbough.prompt.md
  asset_path: worlds/last-lantern/assets/portraits/mara-underbough.png
  seed: 17492
```

And appends to `log.md`:

```text
2026-05-02  portrait.generated  mara-underbough  seed=17492
```

## Approval / Lock

Humans bump `portrait.status` from `generated` to `locked` by editing the
character page. The pipeline must check status before generating; `locked`
short-circuits.

A locked portrait can still be regenerated, but only if the user explicitly
removes the lock (status set back to `prompt_ready` or `generated` and a log
entry written). The runtime should refuse to silently overwrite.

## Consistency Across Many Characters

Open problem, deliberately not solved at MVP:

- per-character seed gives intra-character stability across regenerations
- shared world style header gives broad cohesion
- a "style reference image" path could anchor multiple portraits to one look,
  but that requires provider support and is out of scope until the basic
  pipeline runs

The schema leaves room: `art-style.md` can later add `style_reference_image:
<path>` and the composer can reference it. No breaking change required.

## MVP Stub Behavior

For the first vertical slice the runtime should:

- compose the prompt and write `<id>.prompt.md`
- set `portrait.status: prompt_ready`
- not call any image provider
- leave `asset_path` null

This proves the seam without hitting any external service. Tests can assert
the prompt file exists and contains the expected sections. Image-gen plugs in
later as a separate task.
