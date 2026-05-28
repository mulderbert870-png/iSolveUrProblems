import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client bound to the current request's cookies.
 *
 * Use from Server Components and route handlers. This is NOT the
 * service-role client — for service-role writes that need to bypass RLS,
 * keep using the existing raw-fetch pattern in src/lib/supabaseAdmin.ts.
 */
export async function getSupabaseServer(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase URL and anon key must be configured");
  }

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[],
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Calling `set` from a Server Component throws; that's expected —
          // the middleware refresh path is responsible for writing cookies.
        }
      },
    },
  });
}
