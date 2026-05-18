"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

const MESSAGES: Record<string, string> = {
  OAuthSignin: "There was a problem starting the sign-in process.",
  OAuthCallback: "There was a problem completing sign-in.",
  OAuthCreateAccount: "Could not create your account.",
  EmailCreateAccount: "Could not create your account.",
  Callback: "There was a problem completing sign-in.",
  OAuthAccountNotLinked: "This email is already used with a different sign-in method.",
  EmailSignin: "The sign-in link could not be sent. Check your email address and try again.",
  CredentialsSignin: "Invalid credentials.",
  SessionRequired: "Please sign in to continue.",
  Default: "The sign-in link is no longer valid — it may have already been used or expired.",
};

function ErrorContent() {
  const params = useSearchParams();
  const error = params.get("error") ?? "Default";
  const message = MESSAGES[error] ?? MESSAGES.Default;

  return (
    <div className="w-full max-w-sm text-center space-y-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign-in failed</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link
        href="/login"
        className="inline-block w-full rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Request a new link
      </Link>
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
