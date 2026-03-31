import { API_URL } from "../../../secrets";
import {
  authorizationBearerHeader,
  sessionTokenFromRequestAuthHeader,
} from "../../../../../src/lib/apiRouteSecurity";

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
    const res = await fetch(`${API_URL}/v1/sessions/keep-alive`, {
      method: "POST",
      headers: {
        Authorization: authorizationBearerHeader(token),
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Session keep-alive proxy error:", err);
    return new Response(
      JSON.stringify({
        code: 500,
        data: { message: "Keep-alive failed" },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}