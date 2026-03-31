"use client";

import { useState } from "react";
import Image from "next/image";
import { LiveAvatarSession } from "./LiveAvatarSession";
import Link from "next/link";
export const LiveAvatarDemo = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExited, setIsExited] = useState(false);

  const startSession = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/start-session", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Failed to start session");
        setIsLoading(false);
        return;
      }
      const { session_token } = await res.json();
      setSessionToken(session_token);
      setIsLoading(false);
    } catch (err: unknown) {
      setError((err as Error).message);
      setIsLoading(false);
    }
  };

  const onSessionStopped = (opts?: { reason?: "inactivity" }) => {
    if (opts?.reason === "inactivity") {
      setIsExited(true);
      setSessionToken("");
      return;
    }
    // Return to start screen when user finishes talking (no auto-restart)
    setSessionToken("");
  };

  // Helper function to try closing the tab with multiple methods
  const tryCloseTab = () => {
    if (typeof window === "undefined") return;

    // Try window.close() multiple times with different approaches
    try {
      window.close();
    } catch (e) {
      // Ignore
    }

    // Try self.close() (some browsers support this)
    try {
      (window as any).self?.close();
    } catch (e) {
      // Ignore
    }

    // Try top.close() if in iframe
    try {
      if (window.top && window.top !== window) {
        (window.top as any).close();
      }
    } catch (e) {
      // Ignore
    }
  };

  const handleExit = (completeExit: boolean = false) => {
    if (completeExit) {
      // Aggressively try to exit/close the tab on mobile
      if (typeof window !== "undefined") {
        // Detect if we're on mobile
        const isMobile =
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent,
          );

        // For mobile: Try multiple aggressive exit strategies
        if (isMobile) {
          // Strategy 1: Try window.close() immediately (works if opened by script)
          try {
            if (window.opener || window.history.length === 1) {
              window.close();
              // Give it a moment to close
              setTimeout(() => {
                // If still open, try other methods
                tryCloseTab();
              }, 100);
              return;
            }
          } catch (e) {
            // Fall through to other methods
          }

          // Strategy 2: Navigate to about:blank to minimize the page
          // This creates a blank page that's easy to close
          try {
            window.location.replace("about:blank");
            // Also try to close after navigation
            setTimeout(() => {
              try {
                window.close();
              } catch (e) {
                // Ignore - already on blank page
              }
            }, 100);
            return;
          } catch (e) {
            console.warn("Failed to navigate to about:blank:", e);
          }

          // Strategy 3: Try history.back() if available
          if (window.history.length > 1) {
            try {
              window.history.back();
              return;
            } catch (e) {
              // Continue to next strategy
            }
          }

          // Strategy 4: Navigate to referrer if available
          const referrer = document.referrer;
          if (
            referrer &&
            referrer !== window.location.href &&
            referrer !== ""
          ) {
            try {
              window.location.replace(referrer);
              return;
            } catch (e) {
              // Continue to final strategy
            }
          }

          // Strategy 5: Final fallback - Navigate to about:blank
          // This at least minimizes the page content
          try {
            window.location.replace("about:blank");
          } catch (e) {
            // Last resort: Show exit message
            setIsExited(true);
            setSessionToken("");
          }
        } else {
          // For desktop: Use standard navigation
          if (window.history.length > 1) {
            try {
              window.history.back();
              return;
            } catch (e) {
              // Fall through
            }
          }

          const referrer = document.referrer;
          if (
            referrer &&
            referrer !== window.location.href &&
            referrer !== ""
          ) {
            try {
              window.location.href = referrer;
              return;
            } catch (e) {
              // Fall through
            }
          }

          try {
            window.location.href = "/";
          } catch (e) {
            setIsExited(true);
            setSessionToken("");
          }
        }
      }
      return;
    }
    // Regular exit - show "Session Ended" message
    setIsExited(true);
    setSessionToken("");
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <div className="text-inset text-xl">Loading...</div>
      </div>
    );
  }

  if (isExited) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <div className="text-inset text-2xl font-semibold">Session Ended</div>
        <div className="text-inset text-center text-lg opacity-90">
          Thank you for using iSolveUrProblems.ai
        </div>
      </div>
    );
  }

  // Start screen: show startscreen image with "Talk to iScott" button overlay
  if (!sessionToken) {
    return (
      <div className="relative w-full h-full min-h-screen flex flex-col items-center justify-end overflow-hidden bg-black">
        <Image
          src="/startscreen.png"
          alt="Start screen"
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
        />
        <div className="absolute top-0 left-0 right-0 z-10 flex flex-col items-center pt-4 pb-2">
          <h1 className="text-white text-2xl font-bold tracking-tight">
            iSolveUrProblems.ai - beta
          </h1>
          {/* <p className="text-white text-sm font-medium mt-1">
            Everything. All the Time.
          </p> */}
        </div>
        {/* Same position as "Finish Talking" in LiveAvatarSession */}
        <div className="fixed bottom-40 left-1/2 -translate-x-1/2 w-[95%] max-w-7xl z-20 px-4">
          {error && (
            <div className="mb-3 max-w-xl mx-auto rounded-xl bg-black/55 px-5 py-4 backdrop-blur-sm border border-white/10">
              <p className="text-center text-white text-xl sm:text-2xl font-semibold leading-snug [text-shadow:0_2px_16px_rgba(0,0,0,0.9)]">
                {error}
              </p>
            </div>
          )}
          <div className="flex justify-center mb-4">
            <button
              type="button"
              onClick={startSession}
              disabled={isLoading}
              className="btn-inset p-4 rounded-lg flex items-center justify-center text-xl font-medium whitespace-nowrap"
            >
              {isLoading ? "Starting…" : "Talk to this guy"}
            </button>
          </div>
        </div>
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-7xl z-20 px-4">
          <p className="mb-2 text-center text-xs text-white flex flex-wrap items-center justify-center gap-x-1.5">
            <Link
              href="https://wildworks.live"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-white transition-colors"
            >
              Wildworks.Live
            </Link>
            <span aria-hidden="true">•</span>
            <span>© 2026 iSolveUrProblems.ai</span>
            <span aria-hidden="true">•</span>
            <Link href="/terms" className="text-white hover:text-white transition-colors">
              Terms
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <LiveAvatarSession
      mode="FULL"
      sessionAccessToken={sessionToken}
      onSessionStopped={onSessionStopped}
      onExit={handleExit}
    />
  );
};
