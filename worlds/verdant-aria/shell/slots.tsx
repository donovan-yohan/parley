/**
 * Verdant Aria — slot overrides.
 *
 * Registers two slot components for the `verdant-aria` world:
 *   - header-crest: small heraldic SVG crest + crown motif
 *   - dialogue-frame: gold-bordered ornate panel
 *
 * This module is a side-effect import at world-bundle load time.
 * For shell:"default" worlds the worlds-loader does not yet auto-import
 * slot modules — that gap is tracked as a future loader enhancement.
 * Ship the file so it is ready when auto-import lands.
 *
 * Usage (once loader auto-import is live):
 *   import "worlds/verdant-aria/shell/slots";
 */

import { h, registerSlot } from "@parley/sdk";
import type { SlotContext } from "@parley/sdk";

const WORLD_ID = "verdant-aria";

// ── Header Crest ──────────────────────────────────────────────────────────────

/**
 * Small heraldic SVG crown + shield motif rendered in the header slot.
 * All geometry is inline — no external asset required.
 */
function HeaderCrest(_props: SlotContext) {
  return h(
    "div",
    { "data-slot": "header-crest", style: { display: "flex", alignItems: "center", gap: "0.4rem" } },
    h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        width: "32",
        height: "36",
        viewBox: "0 0 32 36",
        "aria-hidden": "true",
        fill: "none",
      },
      // Shield body
      h("path", {
        d: "M16 2 L30 7 L30 18 C30 27 16 34 16 34 C16 34 2 27 2 18 L2 7 Z",
        fill: "rgba(91,51,135,0.7)",
        stroke: "#d4af37",
        "stroke-width": "1.5",
      }),
      // Crown — three points
      h("path", {
        d: "M9 16 L9 22 L23 22 L23 16 L20 13 L16 17 L12 13 Z",
        fill: "#d4af37",
        opacity: "0.9",
      }),
      // Crown base band
      h("rect", {
        x: "9",
        y: "21",
        width: "14",
        height: "2.5",
        rx: "0.5",
        fill: "#d4af37",
      }),
      // Center gem
      h("circle", {
        cx: "16",
        cy: "14",
        r: "1.5",
        fill: "#f5e8c8",
      }),
    ),
    h(
      "span",
      {
        style: {
          fontFamily: "'Cinzel', serif",
          fontSize: "0.75rem",
          fontWeight: "600",
          color: "#d4af37",
          letterSpacing: "0.08em",
          textTransform: "uppercase" as const,
        },
      },
      "Verdant Aria",
    ),
  );
}

// ── Dialogue Frame ────────────────────────────────────────────────────────────

/**
 * Replaces the default dialogue frame with a gold-bordered ornate panel.
 * Children are passed through; the slot system renders this as the root wrapper.
 */
function DialogueFrame(props: SlotContext & { children?: unknown }) {
  return h(
    "div",
    {
      "data-slot": "dialogue-frame",
      style: {
        border: "2px solid #d4af37",
        borderRadius: "0.4rem",
        background: "rgba(245,232,200,0.95)",
        color: "#0a0e3d",
        boxShadow: [
          "0 0 0 1px rgba(212,175,55,0.4) inset",
          "0 4px 32px rgba(10,14,61,0.6)",
          "0 0 16px rgba(212,175,55,0.12)",
        ].join(", "),
        padding: "1rem 1.25rem",
        position: "relative" as const,
      },
    },
    // Corner accent — top left
    h("span", {
      "aria-hidden": "true",
      style: {
        position: "absolute" as const,
        top: "4px",
        left: "4px",
        width: "10px",
        height: "10px",
        borderTop: "2px solid #d4af37",
        borderLeft: "2px solid #d4af37",
        borderRadius: "2px 0 0 0",
      },
    }),
    // Corner accent — top right
    h("span", {
      "aria-hidden": "true",
      style: {
        position: "absolute" as const,
        top: "4px",
        right: "4px",
        width: "10px",
        height: "10px",
        borderTop: "2px solid #d4af37",
        borderRight: "2px solid #d4af37",
        borderRadius: "0 2px 0 0",
      },
    }),
    // Corner accent — bottom left
    h("span", {
      "aria-hidden": "true",
      style: {
        position: "absolute" as const,
        bottom: "4px",
        left: "4px",
        width: "10px",
        height: "10px",
        borderBottom: "2px solid #d4af37",
        borderLeft: "2px solid #d4af37",
        borderRadius: "0 0 0 2px",
      },
    }),
    // Corner accent — bottom right
    h("span", {
      "aria-hidden": "true",
      style: {
        position: "absolute" as const,
        bottom: "4px",
        right: "4px",
        width: "10px",
        height: "10px",
        borderBottom: "2px solid #d4af37",
        borderRight: "2px solid #d4af37",
        borderRadius: "0 0 2px 0",
      },
    }),
    props.children as ReturnType<typeof h> | null,
  );
}

// ── Register ──────────────────────────────────────────────────────────────────

registerSlot(WORLD_ID, "header-crest", HeaderCrest);
registerSlot(WORLD_ID, "dialogue-frame", DialogueFrame);
