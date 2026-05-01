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
        const chatResp = await fetch("/api/openai-chat-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            image_analysis: imageAnalysis || undefined,
            image_base64: vision?.base64 || undefined,
            image_mime: vision?.mime || undefined,
          }),
        });
        const chatBody = await chatResp.json().catch(() => null);
        const chatResponseText = chatBody?.response;
        if (!chatResp.ok || !chatResponseText || typeof chatResponseText !== "string") {
          console.error("[CUSTOM] openai-chat-complete failed", {
            status: chatResp.status,
            body: chatBody,
          });
          return;
        }
        const ttsResp = await fetch("/api/elevenlabs-text-to-speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chatResponseText }),
        });
        const ttsBody = await ttsResp.json().catch(() => null);
        const audio = ttsBody?.audio;
        if (!ttsResp.ok || !audio) {
          console.error("[CUSTOM] elevenlabs-text-to-speech failed", {
            status: ttsResp.status,
            body: ttsBody,
          });
          return;
        }
        return sessionRef.current.repeatAudio(audio);
      }
    },
    [sessionRef, mode, reportActivity],
  );

  return {
    sendMessage,
  };
};
