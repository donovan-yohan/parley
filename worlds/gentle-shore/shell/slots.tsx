import { h, registerSlot } from "@parley/sdk";

/* ============================================================
   gentle-shore / shell/slots.tsx
   Slot overrides for the "default" shell.
   Registers two slots scoped to the gentle-shore world:
     1. dialogue-frame — paper-card panel with subtle bob animation
     2. scene-backdrop — gradient sky + soft inline-SVG cloud layer
   ============================================================ */

const WORLD_ID = "gentle-shore";

// ── Bobbing dialogue frame ─────────────────────────────────────
registerSlot(WORLD_ID, "dialogue-frame", ({ children }) => {
  const style = {
    background:   "#fff8ec",
    border:       "1.5px solid #a8d5a8",
    borderRadius: "1.25rem",
    boxShadow:    "0 4px 12px rgba(168,213,168,0.3)",
    padding:      "1.25rem",
    position:     "relative" as const,
    overflow:     "hidden" as const,
    animation:    "dialogueBob 4s ease-in-out infinite",
  };

  return (
    <div style={style} class="dialogue-frame gs-dialogue-frame">
      <style>{`
        @keyframes dialogueBob {
          0%   { transform: translateY(0px); }
          45%  { transform: translateY(-3px); }
          75%  { transform: translateY(-1.5px); }
          100% { transform: translateY(0px); }
        }
        .gs-dialogue-frame {
          animation: dialogueBob 4s ease-in-out infinite;
        }
      `}</style>
      {children}
    </div>
  );
});

// ── Gradient sky backdrop with cloud layer ─────────────────────
registerSlot(WORLD_ID, "scene-backdrop", ({ children }) => {
  const backdropStyle = {
    position:   "absolute" as const,
    inset:      "0",
    background: "linear-gradient(180deg, #ffe8c8 0%, #fff4e0 30%, #d4ecd4 70%, #a8d5a8 100%)",
    overflow:   "hidden" as const,
    zIndex:     "0",
  };

  const cloudStyle = {
    position:          "absolute" as const,
    top:               "0",
    left:              "0",
    width:             "100%",
    height:            "60%",
    pointerEvents:     "none" as const,
    zIndex:            "1",
  };

  const contentStyle = {
    position: "relative" as const,
    zIndex:   "2",
  };

  return (
    <div style={backdropStyle} class="scene-backdrop gs-scene-backdrop">
      {/* Soft inline SVG cloud layer */}
      <svg
        style={cloudStyle}
        viewBox="0 0 800 300"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <ellipse cx="120" cy="80" rx="90" ry="38" fill="white" opacity="0.38" />
        <ellipse cx="160" cy="70" rx="60" ry="28" fill="white" opacity="0.28" />
        <ellipse cx="500" cy="55" rx="110" ry="42" fill="white" opacity="0.32" />
        <ellipse cx="550" cy="45" rx="70"  ry="30" fill="white" opacity="0.22" />
        <ellipse cx="700" cy="90" rx="80"  ry="34" fill="white" opacity="0.28" />
        <ellipse cx="740" cy="78" rx="50"  ry="22" fill="white" opacity="0.18" />
      </svg>
      <div style={contentStyle}>{children}</div>
    </div>
  );
});
