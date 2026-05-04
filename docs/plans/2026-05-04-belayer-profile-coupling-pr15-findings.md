# PR #15 — Hermes Image-Gen Tool Probe Findings

**Probe target:** `~/.hermes/hermes-agent/tools/image_generation_tool.py` and surrounding registry/provider modules.

## Tool surface

Single tool registered by Hermes:

- **Name:** `image_generate`
- **Description:** "The text prompt describing the desired image. Be detailed and descriptive." Output is delivered as Markdown `![description](url-or-path)` by the gateway.
- **Parameters:**
  - `prompt` (string, required) — descriptive natural-language prompt.
  - `aspect_ratio` (string enum: `landscape` 16:9 wide, `portrait` 16:9 tall, `square` 1:1).

## Provider model

- Providers registered at plugin import-time via `PluginContext.register_image_gen_provider()`.
- Active provider chosen by `image_gen.provider` in Hermes `config.yaml`.
- Fallback logic in `agent/image_gen_registry.py`: if exactly one provider registered, use it; else if `fal` is registered, use it (legacy default).
- Probed registry behavior in `agent/image_gen_registry.py` and provider abstraction in `agent/image_gen_provider.py`.

## Output handling

- Image artifacts delivered via Markdown image syntax from the gateway. Gateway places the image at a known path or URL.
- Hermes maintains an image cache at `~/.hermes/image_cache/` and per-profile cache under `<profile>/cache/images/`.

## Implications for Parley PR #15

1. **`background-artist` and `portrait-artist` talents** materialized by PR #15 will declare `authority.tools: ["image_generate"]` in their `.belayer-talent.yaml` (or whatever Belayer's `BELAYER_TOOLS` env mechanism expects).
2. **`parley-image-wake/v1` envelope** maps to a single `image_generate` invocation. Carries the prompt text, aspect ratio, and a Parley-side output-target identifier (so Parley can correlate the gateway-delivered image back to the scene/character it was generated for).
3. **Output capture:** Parley's image wake handler must parse the Markdown image response from the wake-result, extract the URL or local path, and copy/symlink the file into `worlds/<w>/assets/portraits/<character-id>.png` or `worlds/<w>/assets/backgrounds/<scene-id>.png`. Update the existing `worlds/<w>/assets/manifest.json` on success.
4. **No additional Hermes plugin install required** — `image_generate` is a built-in Hermes tool. Provider configuration (e.g., `fal` API key) is the user's existing Hermes setup; Parley does not gate on it but should surface a clear error when wake-result indicates provider failure.
5. **Aspect ratio mapping:** Parley scenes already declare `default_aspect_ratio` in `worlds/<w>/WORLD.md` (e.g., `"3:4"` for last-lantern, `"16:9"` for cyberpunk/orchard). Map this to Hermes's enum: 3:4 → portrait (closest available), 16:9 → landscape, 1:1 → square. PR #15 will add this mapping helper.

## What this unblocks for PR #15 task list

- **UI.1** can specify exact `authority.tools` set: `["image_generate"]` for both `background-artist` and `portrait-artist` talents.
- **UI.2/UI.3** (image wake schemas) can now define `parley-image-wake/v1` with required fields: `prompt`, `aspect_ratio`, `output_target` (`{ kind: "portrait" | "background", id: string }`), and standard wake fields (`wake_id`, `crag_slug`, `actor_id`, `current_story_context`).
- **UI.4** (wake handler) parses Markdown image response, copies asset, updates manifest, emits `visual_asset_ready` event.

## What's out of scope

- Per-style consistency (anchoring multiple portraits to the same character look) — Hermes `image_generate` doesn't expose a seed/character-anchor knob in the surface we observed. Style consistency comes from prompt engineering by the talent's system prompt; revisit if Hermes adds seed support.
- Provider failover within a single wake — single provider per call.
- Streaming image-gen progress — the Hermes tool is request/response, not streaming.
