"use client";

import { useEffect } from "react";
import { captureClientError } from "../src/lib/observability/clientLogger";

/**
 * Root error boundary. Catches errors thrown in the root layout itself.
 * Must render its own <html>/<body> because the root layout failed.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    void captureClientError(error, { boundary: "app/global-error.tsx" });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-zinc-900 text-white flex min-h-screen items-center justify-center">
        <main className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <h2 className="text-xl font-semibold">Something went very wrong.</h2>
          <p className="text-sm text-zinc-400">
            The page could not load. We&apos;ve been notified.
          </p>
        </main>
      </body>
    </html>
  );
}
