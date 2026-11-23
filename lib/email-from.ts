/**
 * Who Atlas's emails come from. Until a domain is verified in Resend this is Resend's shared test sender, which only
 * delivers to the Resend account's owner: everyone else's invite or sign-in email is refused (403), and the coach is
 * given the link to share instead. With a verified domain, set EMAIL_FROM in Vercel (e.g. "Atlas <hello@atlas.app>"):
 * no code change.
 */
export const RESEND_TEST_SENDER = "Atlas <onboarding@resend.dev>";

export function emailFrom(env: Record<string, string | undefined> = process.env): string {
  const v = env.EMAIL_FROM?.trim();
  return v && /<[^@\s>]+@[^@\s>]+\.[^@\s>]+>$|^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : RESEND_TEST_SENDER;
}
