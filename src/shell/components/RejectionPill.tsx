/**
 * RejectionPill.tsx — inline pill shown when a turn is rejected.
 *
 * Renders near the input on L3 when the server returns verdict: "revise".
 * Does NOT modify the transcript.
 */

import { h } from "preact";
import type { VNode } from "preact";

interface RejectionPillProps {
  message: string;
}

export function RejectionPill({ message }: RejectionPillProps): VNode {
  return (
    <div class="rejection-pill" role="alert" aria-live="polite">
      <span class="rejection-pill-icon" aria-hidden="true">↩</span>
      <span class="rejection-pill-text">{message}</span>
    </div>
  );
}
