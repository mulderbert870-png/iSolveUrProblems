"use client";

import { useEffect, useRef } from "react";
import {
  classifySceneChange,
  dhashFromCanvas,
  hammingDistance,
  type SceneChange,
} from "./dhash";

/**
 * Adaptive-fps polling loop for Go Live mode. Per Q1.3b:
 *   - 1 fps baseline
 *   - Throttle to 0.2 fps when scene has been stable for N frames
 *   - Burst to 2 fps for the next M frames after a large scene change
 *
 * Pauses entirely when the tab is backgrounded
 * (`document.visibilityState === 'hidden'`).
 *
 * Per Q1.3c: client computes perceptual hash first (dhash) and tells the
 * server `scene_change: "same" | "small" | "large"`. Server short-circuits
 * when scene is unchanged (no vision call). Server confirms by also
 * judging via the model.
 */

const FPS_BASELINE_MS = 1000;
const FPS_THROTTLED_MS = 5000;
const FPS_BURST_MS = 500;
const STABLE_FRAMES_BEFORE_THROTTLE = 3;
const BURST_FRAMES_AFTER_LARGE = 3;
const HAMMING_SMALL_THRESHOLD = 4;
const HAMMING_LARGE_THRESHOLD = 15;
const FRAME_W = 640;
const FRAME_H = 480;

export type GoLiveStreamerArgs = {
  /** Whether the streamer should be running. */
  active: boolean;
  /** The currently-streaming <video> element. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Avatar session id, for media_events tagging. */
  sessionId?: string | null;
  /** Caller's signal that the avatar is currently speaking. */
  isAvatarTalking?: boolean;
  /** Caller's signal that the user is currently speaking. */
  isUserTalking?: boolean;
  /**
   * Fired when the server says we should narrate this frame.
   * Caller decides whether to push the caption to the LiveAvatar SDK
   * (e.g. sessionRef.current.repeat(caption)).
   */
  onNarrate?: (caption: string) => void;
  /**
   * Fired for every frame analyzed, regardless of narrate decision.
   * Caller can persist via /api/media/capture if desired.
   */
  onFrame?: (info: {
    blob: Blob;
    caption: string;
    sceneChange: SceneChange;
  }) => void;
};

export function useGoLiveStreamer(args: GoLiveStreamerArgs): void {
  const lastHashRef = useRef<string | null>(null);
  const lastCaptionRef = useRef<string>("");
  const stableCountRef = useRef<number>(0);
  const burstCountRef = useRef<number>(0);
  const lastNarrateAtRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);
  const intervalRef = useRef<number | null>(null);
  const visibilityHidRef = useRef<boolean>(false);

  // Mirror callbacks/flags into refs so the polling loop closure doesn't
  // need to re-create every time React state changes.
  const propsRef = useRef(args);
  propsRef.current = args;

  useEffect(() => {
    if (!args.active) {
      stopLoop();
      return;
    }

    // Reset state for a fresh session.
    lastHashRef.current = null;
    lastCaptionRef.current = "";
    stableCountRef.current = 0;
    burstCountRef.current = 0;

    const onVisibility = () => {
      visibilityHidRef.current = document.visibilityState === "hidden";
    };
    document.addEventListener("visibilitychange", onVisibility);
    visibilityHidRef.current = document.visibilityState === "hidden";

    scheduleNext(FPS_BASELINE_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.active]);

  function stopLoop() {
    if (intervalRef.current !== null) {
      window.clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function scheduleNext(delayMs: number) {
    if (intervalRef.current !== null) {
      window.clearTimeout(intervalRef.current);
    }
    intervalRef.current = window.setTimeout(tick, delayMs);
  }

  async function tick() {
    intervalRef.current = null;
    const { active, videoRef } = propsRef.current;
    if (!active) return;

    // Skip while backgrounded — re-check on next tick.
    if (visibilityHidRef.current) {
      scheduleNext(FPS_THROTTLED_MS);
      return;
    }
    if (inFlightRef.current) {
      scheduleNext(FPS_BASELINE_MS);
      return;
    }

    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      scheduleNext(FPS_BASELINE_MS);
      return;
    }

    inFlightRef.current = true;
    try {
      await processFrame(video);
    } finally {
      inFlightRef.current = false;
    }

    // Decide next-tick delay based on recent scene changes.
    let nextDelay: number;
    if (burstCountRef.current > 0) {
      burstCountRef.current -= 1;
      nextDelay = FPS_BURST_MS;
    } else if (stableCountRef.current >= STABLE_FRAMES_BEFORE_THROTTLE) {
      nextDelay = FPS_THROTTLED_MS;
    } else {
      nextDelay = FPS_BASELINE_MS;
    }
    scheduleNext(nextDelay);
  }

  async function processFrame(video: HTMLVideoElement) {
    const props = propsRef.current;

    // Draw current video frame to a working canvas.
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Hash + classify scene change.
    const hash = dhashFromCanvas(canvas);
    let sceneChange: SceneChange = "large";
    if (hash && lastHashRef.current) {
      const dist = hammingDistance(hash, lastHashRef.current);
      sceneChange = classifySceneChange(dist);
    }
    if (hash) lastHashRef.current = hash;

    // Update stability + burst counters.
    if (sceneChange === "same") {
      stableCountRef.current += 1;
    } else {
      stableCountRef.current = 0;
      if (sceneChange === "large") {
        burstCountRef.current = BURST_FRAMES_AFTER_LARGE;
      }
    }

    // Cheap exit when scene is unchanged — don't even send to server.
    if (sceneChange === "same") {
      return;
    }

    // JPEG-encode the frame for upload.
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7),
    );
    if (!blob) return;

    const frameB64 = await blobToBase64(blob);
    if (!frameB64) return;

    // Server call.
    type GoLiveResult = {
      caption: string;
      should_narrate: boolean;
      narrate_reason?: string;
    };
    let result: GoLiveResult | null = null;
    try {
      const res = await fetch("/api/analyze/go-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frame_base64: frameB64,
          mime_type: "image/jpeg",
          session_id: props.sessionId ?? null,
          scene_change: sceneChange,
          last_caption: lastCaptionRef.current || undefined,
        }),
      });
      result = (await res.json()) as GoLiveResult;
    } catch {
      // Network blip — skip this frame.
      return;
    }
    if (!result) return;

    if (result.caption) {
      lastCaptionRef.current = result.caption;
    }

    props.onFrame?.({
      blob,
      caption: result.caption ?? "",
      sceneChange,
    });

    // Final narration gate — additional client-side suppression:
    //   - Don't narrate while avatar is talking (would talk over itself)
    //   - Don't narrate while user is talking (would interrupt user)
    //   - Don't narrate if we narrated within the last 10s
    const now = Date.now();
    const SUPPRESS_MS = 10_000;
    const canNarrate =
      result.should_narrate &&
      result.caption &&
      !props.isAvatarTalking &&
      !props.isUserTalking &&
      now - lastNarrateAtRef.current >= SUPPRESS_MS;

    if (canNarrate) {
      lastNarrateAtRef.current = now;
      props.onNarrate?.(result.caption);
    }
  }
}

async function blobToBase64(blob: Blob): Promise<string | null> {
  try {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunk)),
      );
    }
    if (typeof window === "undefined") return null;
    return window.btoa(bin);
  } catch {
    return null;
  }
}
