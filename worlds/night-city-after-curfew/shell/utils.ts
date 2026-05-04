/**
 * Shared utilities for Night City After Curfew's custom shell pages.
 *
 * The shell is hash-routed (`#/world/...`), so navigation from a custom shell
 * must update `window.location.hash` to fire the shell's `hashchange`
 * listener. Pushing to `history` would not reach the router.
 */

declare const __PARLEY_SDK__: {
  navigate?: (path: string) => void;
};

/**
 * Navigate to a shell route. Prefers the SDK-exposed router navigate when
 * available; otherwise sets the location hash directly.
 */
export function navigate(path: string): void {
  if (typeof __PARLEY_SDK__ !== "undefined" && typeof __PARLEY_SDK__.navigate === "function") {
    __PARLEY_SDK__.navigate(path);
    return;
  }
  if (typeof window === "undefined") return;
  window.location.hash = path.startsWith("#") ? path : `#${path}`;
}

/** Compact relative-time string for HUD readouts ("3m ago", "1h ago", ...). */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
