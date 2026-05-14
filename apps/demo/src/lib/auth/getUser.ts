import { getSupabaseServer } from "./supabaseServer";
import type { User } from "@supabase/supabase-js";

/**
 * Resolve the currently signed-in user from request cookies, or null if
 * the caller is anonymous.
 *
 * Use at the top of any API route or Server Component that wants to scope
 * data to a user. Anonymous callers are fine — the avatar conversation
 * works without auth; report delivery (M1.4) is what'll gate on a non-null
 * return here.
 */
export async function getUser(): Promise<User | null> {
  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

/** Same as getUser but returns just the id (or null). Convenience. */
export async function getUserId(): Promise<string | null> {
  const user = await getUser();
  return user?.id ?? null;
}
