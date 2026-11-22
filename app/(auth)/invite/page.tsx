import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { lookupInvite } from "@/lib/auth/invite-lookup";

export const metadata: Metadata = { title: "Your invite", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Where an invite link lands. One screen, one button. Opening it (or having a message app fetch it for a preview,
 * or opening it twice) only reads: nothing is used up and nobody is signed in until the button is pressed.
 * Never an email field, a "get a link" or a way to make an account here.
 */
export default async function InvitePage({ searchParams }: { searchParams: { token?: string | string[] } }) {
  const token = Array.isArray(searchParams.token) ? searchParams.token[0] : searchParams.token;
  const invite = await lookupInvite(token);

  if (!invite) {
    return (
      <div className="w-full max-w-sm space-y-4 px-6 text-center">
        <p className="text-lg font-semibold tracking-tight">This link has expired. Ask your coach for a new one.</p>
      </div>
    );
  }

  // Someone else is signed in on this device (the coach, testing): Continue replaces that session, and says so.
  const signedInAs = (await auth())?.user?.email;
  const someoneElse = !!signedInAs && signedInAs.toLowerCase() !== invite.email.toLowerCase();

  return (
    <form method="POST" action="/api/invite/continue" className="w-full max-w-sm space-y-5 px-6 text-center">
      <input type="hidden" name="token" value={token} />
      <h1 className="text-2xl font-semibold tracking-tight">Hi {invite.firstName}</h1>
      <button type="submit" className="inline-block min-h-12 w-full rounded-md bg-primary px-4 py-3 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90">
        Continue as {invite.firstName}
      </button>
      {someoneElse && <p className="text-sm text-muted-foreground">You&apos;re signed in as someone else on this device. Continuing signs them out.</p>}
    </form>
  );
}
