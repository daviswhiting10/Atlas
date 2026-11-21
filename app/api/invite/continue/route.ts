import { NextResponse } from "next/server";
import { lookupInvite } from "@/lib/auth/invite-lookup";
import { SESSION_COOKIES, appBase, isInviteToken, signInUrl } from "@/lib/auth/invite-link";

/**
 * The invite button. Only a press (a POST) gets here: a preview fetch or a second look is a GET of /invite and
 * never reaches this. It checks the invite is still good, clears any session already on this browser (the coach
 * testing, or someone else's), and hands over to Auth.js's own link sign-in, which uses the token up.
 */
export async function POST(req: Request) {
  const base = appBase();
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  const invite = isInviteToken(token) ? await lookupInvite(token) : null;
  // Not good any more (used, replaced by a newer link, or expired): back to the one-line message, never a sign-in form.
  if (!invite || !isInviteToken(token)) return NextResponse.redirect(`${base}/invite?token=${encodeURIComponent(String(token ?? ""))}`, 303);

  const res = NextResponse.redirect(signInUrl(base, token, invite.email), 303);
  for (const name of SESSION_COOKIES) res.cookies.set(name, "", { maxAge: 0, path: "/", secure: name.startsWith("__Secure-"), httpOnly: true, sameSite: "lax" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
