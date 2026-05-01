import {
  API_KEY,
  API_URL,
  AVATAR_ID,
  VOICE_ID,
  CONTEXT_ID,
  LANGUAGE,
} from "../secrets";
import { assertCanMintSessionToken } from "../../../src/lib/liveavatarCredits";

export async function POST() {
  const gate = await assertCanMintSessionToken();
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.message }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let session_token = "";
  let session_id = "";
  try {
    const res = await fetch(`${API_URL}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 2026-05-01: tried LITE for dual-brain silence, SDK didn't fully
        // initialize bidirectional flow with LITE tokens (avatar visual OK
        // but no listening/audio interaction). Reverted to FULL while
        // researching a "silent persona" approach (point context_id at a
        // prompt that instructs the LiveAvatar brain to stay silent so
        // gpt-4o-mini wins by default).
        mode: "FULL",
        avatar_id: AVATAR_ID,
        max_session_duration: 20 * 60, // 20 minutes (LiveAvatar API: seconds)
        avatar_persona: {
          voice_id: VOICE_ID,
          context_id: CONTEXT_ID,
          language: LANGUAGE,
        },
      }),
    });
    if (!res.ok) {
      const resp = await res.json();
      let errorMessage = "Failed to retrieve session token";

      // Handle different error response formats
      if (resp?.data && Array.isArray(resp.data) && resp.data.length > 0) {
        errorMessage = resp.data[0].message || errorMessage;
      } else if (resp?.data?.message) {
        errorMessage = resp.data.message;
      } else if (resp?.message) {
        errorMessage = resp.message;
      } else if (resp?.error) {
        errorMessage = resp.error;
      }

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: res.status,
      });
    }
    const data = await res.json();

    session_token = data.data.session_token;
    session_id = data.data.session_id;
  } catch (error) {
    console.error("Error retrieving session token:", error);
    return new Response(
      JSON.stringify({ error: "Failed to retrieve session token" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!session_token) {
    return new Response(
      JSON.stringify({ error: "Failed to retrieve session token" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  return new Response(JSON.stringify({ session_token, session_id }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
