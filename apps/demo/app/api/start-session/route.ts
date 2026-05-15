import {
  API_KEY,
  API_URL,
  AVATAR_ID,
  VOICE_ID,
  CONTEXT_ID,
  LANGUAGE,
} from "../secrets";
import { assertCanMintSessionToken } from "../../../src/lib/liveavatarCredits";
import { getUserId } from "../../../src/lib/auth/getUser";
import { resolveLocaleForRequest } from "../../../src/lib/i18n/resolveLocale";
import { mapLocaleToAvatarLanguage } from "../../../src/lib/i18n/avatarLanguage";

export async function POST(request: Request) {
  const gate = await assertCanMintSessionToken();
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.message }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  // M1.6b — vision ¶26: avatar speaks in the user's language.
  // Falls back to LIVEAVATAR_LANGUAGE env for anonymous callers whose
  // Accept-Language doesn't match a supported locale.
  const userId = await getUserId();
  const locale = await resolveLocaleForRequest({
    userId,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const avatarLanguage = mapLocaleToAvatarLanguage(locale, LANGUAGE);

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
        mode: "FULL",
        avatar_id: AVATAR_ID,
        max_session_duration: 20 * 60, // 20 minutes (LiveAvatar API: seconds)
        avatar_persona: {
          voice_id: VOICE_ID,
          context_id: CONTEXT_ID,
          language: avatarLanguage,
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
  return new Response(
    JSON.stringify({ session_token, session_id, locale, language: avatarLanguage }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
