import { useCallback } from "react";
import { useLiveAvatarContext } from "./context";

export const useAvatarActions = (mode: "FULL" | "CUSTOM") => {
  const { sessionRef } = useLiveAvatarContext();

  const interrupt = useCallback(() => {
    return sessionRef.current.interrupt();
  }, [sessionRef]);

  const repeat = useCallback(
    async (message: string) => {
      if (mode === "FULL") {
        return sessionRef.current.repeat(message);
      } else if (mode === "CUSTOM") {
        // 2026-05-01: added Content-Type header (some Edge runtimes
        // 400 on missing header) + audio guard so we don't call
        // repeatAudio(undefined) when ElevenLabs errors silently.
        try {
          const res = await fetch("/api/elevenlabs-text-to-speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message }),
          });
          if (!res.ok) {
            const errText = await res.text();
            console.error(
              `repeat (CUSTOM) elevenlabs ${res.status}: ${errText.slice(0, 200)}`,
            );
            return;
          }
          const data = await res.json();
          const audio = data?.audio;
          if (!audio || typeof audio !== "string") {
            console.error("repeat (CUSTOM): empty audio in response", data);
            return;
          }
          return sessionRef.current.repeatAudio(audio);
        } catch (err) {
          console.error("repeat (CUSTOM) failed:", err);
        }
      }
    },
    [sessionRef, mode],
  );

  const startListening = useCallback(() => {
    return sessionRef.current.startListening();
  }, [sessionRef]);

  const stopListening = useCallback(() => {
    return sessionRef.current.stopListening();
  }, [sessionRef]);

  return {
    interrupt,
    repeat,
    startListening,
    stopListening,
  };
};
