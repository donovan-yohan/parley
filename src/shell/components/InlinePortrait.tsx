/**
 * InlinePortrait.tsx — inline speaker portrait for L3 transcript.
 *
 * Renders a 42px round avatar (img if avatarSrc provided, else first-letter
 * circle) with the speaker's name as an uppercase label above the dialogue.
 * Children are the dialogue paragraph content.
 */

import { h } from "preact";
import type { VNode, ComponentChildren } from "preact";

interface InlinePortraitProps {
  characterName: string;
  avatarSrc?: string;
  children?: ComponentChildren;
}

export function InlinePortrait({
  characterName,
  avatarSrc,
  children,
}: InlinePortraitProps): VNode {
  const initial = characterName.charAt(0).toUpperCase();

  return (
    <div class="inline-portrait">
      {/* Avatar */}
      <div class="inline-portrait-avatar">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={characterName}
            class="inline-portrait-img"
            width={42}
            height={42}
          />
        ) : (
          <div class="inline-portrait-initial" aria-hidden="true">
            {initial}
          </div>
        )}
      </div>

      {/* Dialogue column */}
      <div class="inline-portrait-dialogue">
        <span class="inline-portrait-name">{characterName}</span>
        <p class="inline-portrait-speech">{children}</p>
      </div>
    </div>
  );
}
