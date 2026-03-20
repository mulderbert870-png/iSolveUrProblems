import { API_URL } from "../../../secrets";

export async function POST(request: Request) {
  const auth = request.headers.get("Authorization");
  if (!auth) {
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
        Authorization: auth,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Session stop proxy error:", err);
    return new Response(
      JSON.stringify({
        code: 500,
        data: { message: (err as Error).message },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
