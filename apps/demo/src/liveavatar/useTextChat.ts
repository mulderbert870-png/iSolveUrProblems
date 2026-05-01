import { useCallback } from "react";
import { useLiveAvatarContext } from "./context";

export type SendMessageVision = {
  // Base64-encoded image bytes (no data: prefix). Optional.
  base64: string;
  // MIME type, e.g. "image/jpeg" or "image/png".
  mime: string;
};

export const useTextChat = (mode: "FULL" | "CUSTOM") => {
  const { sessionRef, reportActivity } = useLiveAvatarContext();

  // CUSTOM mode pipeline (2026-04-30): user text + optional vision frame go
  // directly to gpt-4o-mini via /api/openai-chat-complete (system prompt =
  // SIX_PERSONA_PROMPT). Reply is sent to ElevenLabs TTS, audio is fed to
  // the avatar via repeatAudio. Single-pass vision — no Gemini middleman.
  // The third arg is optional and OPTIONAL: pass an image only when you
  // actually have a frame to send (e.g., Go Live active or user just
  // captured a photo).
  const sendMessage = useCallback(
    async (
      message: string,
      imageAnalysis?: string | null,
      vision?: SendMessageVision | null,
    ) => {
      reportActivity();
      if (mode === "FULL") {
        return sessionRef.current.message(message);
      } else if (mode === "CUSTOM") {
        const response = await fetch("/api/openai-chat-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            // Only one of these will be honored on the server, but we send
            // both for diagnostic / fallback resilience. Native vision
            // (image_base64 + image_mime) takes precedence.
            image_analysis: imageAnalysis || undefined,
            image_base64: vision?.base64 || undefined,
            image_mime: vision?.mime || undefined,
          }),
        });
        const { response: chatResponseText } = await response.json();
        if (!chatResponseText || typeof chatResponseText !== "string") {
          // Don't try to TTS empty/non-string responses.
          return;
        }
        const res = await fetch("/api/elevenlabs-text-to-speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chatResponseText }),
        });
        const { audio } = await res.json();
        if (!audio) return;
        // Have the avatar repeat the audio
        return sessionRef.current.repeatAudio(audio);
      }
    },
    [sessionRef, mode, reportActivity],
  );

  return {
    sendMessage,
  };
};
