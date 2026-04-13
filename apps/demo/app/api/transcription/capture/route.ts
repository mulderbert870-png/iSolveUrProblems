import {
  isSafeTranscriptionSessionId,
} from "../../../../src/lib/apiRouteSecurity";
import { persistUserUtteranceLeadCapture } from "../../../../src/lib/leadCaptureFromUserText";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId: rawSessionId, text: rawText } = body;

    if (!isSafeTranscriptionSessionId(rawSessionId)) {
      return new Response(
        JSON.stringify({ error: "Invalid sessionId" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (typeof rawText !== "string" || !rawText.trim()) {
      return new Response(
        JSON.stringify({ error: "text is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const sessionId = rawSessionId.trim();
    const result = await persistUserUtteranceLeadCapture(sessionId, rawText);

    return new Response(
      JSON.stringify({
        extracted: result.extracted,
        assistantPrompt: result.assistantPrompt,
        shouldSkipVision: result.shouldSkipVision,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error capturing transcription:", error);
    return new Response(
      JSON.stringify({ error: "Failed to capture transcription" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
