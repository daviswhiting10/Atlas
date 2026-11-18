/**
 * What the sign-in error page says. A used or expired link (Auth.js calls it "Verification") is the
 * common one: an invited client opening an old or already-used invite. It says so plainly and
 * points at the person who can send a new one. Pure.
 */

export type ErrorCopy = { title: string; message: string | null; action: "sign-in" | "sign-out" };

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
  NoAccess: "This account no longer has access. If you train with a coach, ask them for a new invite.",
  Default: "Something went wrong signing you in. Try again.",
};

export function errorCopy(code: string | null | undefined): ErrorCopy {
  if (code === "Verification") return { title: "This link has expired.", message: "Ask your trainer for a new one.", action: "sign-in" };
  if (code === "NoAccess") return { title: "No access", message: MESSAGES.NoAccess, action: "sign-out" };
  return { title: "Sign-in failed", message: (code && MESSAGES[code]) || MESSAGES.Default, action: "sign-in" };
}
