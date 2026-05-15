"use client";

/**
 * Persistent 🔴 LIVE indicator pinned to the top of the screen while Go
 * Live mode is active. Per the M1.3 spec — the user must always know
 * the camera is feeding frames to 6.
 *
 * Renders nothing when not active.
 */
export function GoLivePrivacyBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] mt-2 flex items-center gap-2 rounded-full bg-rose-600/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-lg backdrop-blur"
    >
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      Live — 6 is seeing your camera
    </div>
  );
}
