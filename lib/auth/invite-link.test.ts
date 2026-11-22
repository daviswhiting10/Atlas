import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIES, appBase, hashToken, inviteLink, isInviteToken, signInUrl } from "./invite-link";

const raw = "a".repeat(64);

describe("invite link", () => {
  it("hashes like Auth.js: sha256 of the token and the secret", () => {
    expect(hashToken(raw, "s3cret")).toBe(createHash("sha256").update(`${raw}s3cret`).digest("hex"));
  });
  it("only a 64-character hex string is one of ours", () => {
    expect(isInviteToken(raw)).toBe(true);
    for (const bad of ["", "abc", "A".repeat(64), "g".repeat(64), raw + "0", undefined, null, 5]) expect(isInviteToken(bad)).toBe(false);
  });
  it("the shared link goes to the invite page and carries no email and no sign-in", () => {
    const url = inviteLink("https://app.example", raw);
    expect(url).toBe(`https://app.example/invite?token=${raw}`);
    expect(url).not.toMatch(/api\/auth|callback|email/);
  });
  it("the button's destination is Auth.js's own link sign-in, then Today", () => {
    expect(signInUrl("https://app.example", raw, "a+b@x.com")).toBe(`https://app.example/api/auth/callback/email?token=${raw}&email=a%2Bb%40x.com&callbackUrl=${encodeURIComponent("https://app.example/today")}`);
  });
  it("finds the app's address the way the invite code always did", () => {
    expect(appBase({ AUTH_URL: "https://a", NEXTAUTH_URL: "https://b" })).toBe("https://a");
    expect(appBase({ NEXTAUTH_URL: "https://b" })).toBe("https://b");
    expect(appBase({})).toBe("http://localhost:3000");
  });
  it("lists both session cookie names, so Continue replaces whoever is signed in", () => {
    expect(SESSION_COOKIES).toContain("authjs.session-token");
    expect(SESSION_COOKIES).toContain("__Secure-authjs.session-token");
  });
});
