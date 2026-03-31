import { API_URL } from "../../../secrets";
import {
  authorizationBearerHeader,
  sessionTokenFromRequestAuthHeader,
} from "../../../../../src/lib/apiRouteSecurity";
import {
  isLiveAvatarSuccessPayload,
  recordSessionStreamStopped,
} from "../../../../../src/lib/liveavatarCredits";

export async function POST(request: Request) {
  const token = sessionTokenFromRequestAuthHeader(
    request.headers.get("Authorization"),
  );
  if (!token) {
    return new Response(
      JSON.stringify({
        code: 403,
        data: { message: "Authorization required" },
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!API_URL) {
    return new Response(
      JSON.stringify({
        code: 500,
        data: { message: "LIVEAVATAR_API_URL is not configured" },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  try {
    const res = await fetch(`${API_URL}/v1/sessions/stop`, {
      method: "POST",
      headers: {
        Authorization: authorizationBearerHeader(token),
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    if (res.ok && isLiveAvatarSuccessPayload(data)) {
      await recordSessionStreamStopped(token);
    }
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Session stop proxy error:", err);
    return new Response(
      JSON.stringify({
        code: 500,
        data: { message: "Session stop failed" },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
