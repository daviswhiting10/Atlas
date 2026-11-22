"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { errorCopy } from "@/lib/auth/error-copy";

const button =
  "inline-block min-h-11 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90";

function ErrorContent() {
  const copy = errorCopy(useSearchParams().get("error"));

  return (
    <div className="w-full max-w-sm text-center space-y-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      {copy.message && <p className="text-sm text-muted-foreground">{copy.message}</p>}
      {copy.action === "sign-out" ? (
        <button
          type="button"
          onClick={async () => {
            const { signOutAndForget } = await import("@/lib/sign-out");
            await signOutAndForget(`${window.location.origin}/login`);
          }}
          className={button}
        >
          Sign out
        </button>
      ) : (
        <Link href="/login" className={button}>
          Sign in
        </Link>
      )}
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
