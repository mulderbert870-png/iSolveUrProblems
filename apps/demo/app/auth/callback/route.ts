import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "../../../src/lib/auth/supabaseServer";

/**
 * OAuth + magic-link callback handler.
 *
 * Supabase redirects users back here with a `code` param (PKCE flow).
 * We exchange it for a session and forward to `next` (default "/").
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    try {
      const supabase = await getSupabaseServer();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          new URL(
            `/auth/sign-in?error=${encodeURIComponent(error.message)}`,
            request.url,
          ),
        );
      }
    } catch (e) {
      console.error("auth/callback exchange failed", e);
      return NextResponse.redirect(
        new URL("/auth/sign-in?error=callback_failed", request.url),
      );
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
