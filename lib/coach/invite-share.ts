/**
 * Hand an invite link to the phone's share sheet, so the coach texts it in one tap. Where there is
 * no share sheet, or the browser won't open it, the caller shows the link with a copy button.
 */

export type ShareOutcome = "shared" | "cancelled" | "unavailable";

type Sharer = { share?: (data: { title: string; text: string; url: string }) => Promise<void>; canShare?: (data: { title: string; text: string; url: string }) => boolean };

export async function shareInvite(
  invite: { link: string },
  firstName: string,
  nav: Sharer | undefined = typeof navigator === "undefined" ? undefined : (navigator as Sharer)
): Promise<ShareOutcome> {
  if (!nav?.share) return "unavailable";
  const data = { title: "Atlas", text: `${firstName}, you're invited to Atlas. Open this link to sign in:`, url: invite.link };
  if (nav.canShare && !nav.canShare(data)) return "unavailable";
  try {
    await nav.share(data);
    return "shared";
  } catch (err) {
    // Closing the share sheet isn't an error. Anything else (no permission after a slow request) falls back to the sheet with the link.
    return (err as { name?: string })?.name === "AbortError" ? "cancelled" : "unavailable";
  }
}
