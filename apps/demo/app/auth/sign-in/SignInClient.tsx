"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "../../../src/lib/auth/supabaseBrowser";
import { useUser } from "../../../src/lib/auth/AuthProvider";

export default function SignInClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useUser();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If the user is already signed in, bounce them to the home page
  // (or wherever ?next= says).
  useEffect(() => {
    if (!authLoading && user) {
      const next = searchParams.get("next") ?? "/";
      router.replace(next);
    }
  }, [user, authLoading, router, searchParams]);

  const sendMagicLink = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || busy) return;
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const supabase = getSupabaseBrowser();
        const next = searchParams.get("next") ?? "/";
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
        const { error: err } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: redirectTo },
        });
        if (err) {
          setError(err.message);
        } else {
          setInfo("Check your email for the sign-in link.");
        }
      } finally {
        setBusy(false);
      }
    },
    [email, busy, searchParams],
  );

  const signInWithGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const next = searchParams.get("next") ?? "/";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (err) setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [busy, searchParams]);

  return (
    <main className="w-full max-w-sm flex flex-col items-center gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">Sign in to iSolveUrProblems</h1>
      <p className="text-sm text-zinc-400 text-center">
        6 can keep talking to you anonymously — sign in only when you want
        your fix-it reports delivered or 6 to remember you next time.
      </p>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className="w-full rounded-md bg-white text-zinc-900 px-4 py-2 font-medium disabled:opacity-50"
      >
        Continue with Google
      </button>

      <div className="w-full flex items-center gap-3 text-zinc-500 text-xs">
        <span className="flex-1 h-px bg-zinc-700" />
        OR
        <span className="flex-1 h-px bg-zinc-700" />
      </div>

      <form onSubmit={sendMagicLink} className="w-full flex flex-col gap-3">
        <label className="text-sm text-zinc-300" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          placeholder="you@example.com"
          className="rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-white outline-none focus:border-zinc-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="rounded-md bg-amber-400 text-zinc-900 px-4 py-2 font-medium disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send magic link"}
        </button>
      </form>

      {info && <p className="text-sm text-emerald-400 text-center">{info}</p>}
      {error && <p className="text-sm text-rose-400 text-center">{error}</p>}

      <Link
        href="/"
        className="mt-2 text-xs text-zinc-400 hover:text-white underline"
      >
        ← Back to 6
      </Link>
    </main>
  );
}
