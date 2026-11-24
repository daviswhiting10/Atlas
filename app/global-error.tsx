"use client";

import { useEffect } from "react";
import "./globals.css";
import "./dusk.css";
import { healChunkError } from "@/lib/net/skew-heal";

/** The root layout itself broke (it replaces the whole page, so it brings its own html and body). */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.warn("[app error]", error.digest ?? error.message);
    healChunkError(error);
  }, [error]);
  return (
    <html lang="en">
      <body className="antialiased font-body">
        <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">Something went wrong</h1>
          <button type="button" onClick={() => window.location.reload()} className="press mt-8 flex h-14 w-full max-w-xs items-center justify-center rounded-2xl bg-dusk-button text-[17px] font-semibold text-dusk-button-text hover:bg-dusk-button/90">
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
