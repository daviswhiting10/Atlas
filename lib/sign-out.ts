/**
 * Sign out, and forget what this browser held for the account: the "currently logging" bar's session, so the next
 * person to sign in here never sees it. Client-side only.
 */
import { forgetLive } from "@/lib/sessions/live";

export async function signOutAndForget(callbackUrl: string): Promise<void> {
  try {
    forgetLive(window.localStorage);
  } catch {
    // Private mode: nothing was kept.
  }
  const { signOut } = await import("next-auth/react");
  await signOut({ callbackUrl });
}

/** The coach's sign-out (header, More sheet): forget this browser's live session, then back to the sign-in page. */
export const signOutToLogin = () => signOutAndForget(`${window.location.origin}/login`);
