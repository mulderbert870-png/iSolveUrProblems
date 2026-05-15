"use client";

import { useEffect } from "react";
import { captureClientError } from "../src/lib/observability/clientLogger";

/**
 * App-level error boundary. Caught client-side errors inside any
 * non-root segment land here.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureClientError(error, { boundary: "app/error.tsx" });
  }, [error]);

  return (
    <main className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <h2 className="text-xl font-semibold text-white">
        Something went wrong.
      </h2>
      <p className="text-sm text-zinc-400">
        6 hit a snag. The error has been reported.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-2 rounded-md bg-amber-400 text-zinc-900 px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </main>
  );
}
