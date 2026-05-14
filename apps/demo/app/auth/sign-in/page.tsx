import { Suspense } from "react";
import SignInClient from "./SignInClient";

// Prevent static prerender — this page reads URL search params and the
// browser-side Supabase client.
export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="w-full max-w-sm flex flex-col items-center gap-6 px-6 py-12">
          <p className="text-sm text-zinc-400">Loading…</p>
        </main>
      }
    >
      <SignInClient />
    </Suspense>
  );
}
