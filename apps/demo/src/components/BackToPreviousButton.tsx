"use client";

import { useRouter } from "next/navigation";

export function BackToPreviousButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="inline-flex items-center rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10 hover:text-white sm:text-sm"
      onClick={() => {
        if (window.opener) {
          window.close();
          return;
        }
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push("/");
      }}
    >
      ← Back
    </button>
  );
}
