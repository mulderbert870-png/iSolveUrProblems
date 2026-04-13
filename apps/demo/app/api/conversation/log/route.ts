import {
  MAX_TRANSCRIPTION_TEXT_CHARS,
  isSafeTranscriptionSessionId,
  truncateUtf8String,
} from "../../../../src/lib/apiRouteSecurity";
import { getSupabaseAdminConfig } from "../../../../src/lib/supabaseAdmin";

type SpeakerRole = "user" | "assistant";

function supabaseHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function isSpeakerRole(value: unknown): value is SpeakerRole {
  return value === "user" || value === "assistant";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId: rawSessionId, text: rawText, role } = body;

    if (!isSafeTranscriptionSessionId(rawSessionId)) {
      return new Response(JSON.stringify({ error: "Invalid sessionId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!isSpeakerRole(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (typeof rawText !== "string" || !rawText.trim()) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sessionId = rawSessionId.trim();
    const text = truncateUtf8String(rawText.trim(), MAX_TRANSCRIPTION_TEXT_CHARS);
    const { url, serviceRoleKey } = getSupabaseAdminConfig();

    const res = await fetch(`${url}/rest/v1/conversation_messages`, {
      method: "POST",
      headers: supabaseHeaders(serviceRoleKey),
      body: JSON.stringify({
        session_id: sessionId,
        role,
        message: text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Failed storing conversation message:", detail);
      return new Response(
        JSON.stringify({ error: "Failed to store conversation message" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error storing conversation message:", error);
    return new Response(
      JSON.stringify({ error: "Failed to store conversation message" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
