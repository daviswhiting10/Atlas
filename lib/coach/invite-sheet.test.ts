import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inviteSheetCopy } from "./invite-sheet-copy";
import { RESEND_TEST_SENDER, emailFrom } from "@/lib/email-from";


describe("the invite sheet never claims an email went out when it didn't", () => {
  it("email couldn't send: 'Share this link', no 'emailed' anywhere", () => {
    const c = inviteSheetCopy({ first: "Chloe", email: "c@example.test", emailed: false, days: 7 });
    expect(c.title).toBe("Share this link");
    expect(`${c.title} ${c.lead} ${c.foot}`).not.toMatch(/emailed|sent to/i);
  });
  it("email sent: says so, with the address", () => {
    const c = inviteSheetCopy({ first: "Chloe", email: "c@example.test", emailed: true, days: 7 });
    expect(c.title).toBe("Invite emailed to Chloe");
    expect(c.lead).toContain("c@example.test");
  });
  it("the sheet: a big Copy link and a smaller Share via… (the OS share sheet), from the shared copy", () => {
    const sheet = readFileSync(new URL("../../components/coach/InviteSheet.tsx", import.meta.url), "utf8");
    expect(sheet).toMatch(/h-14[^"]*"[\s\S]{0,400}Copy link/);
    expect(sheet).toContain("Share via…");
    expect(sheet).toContain("shareInvite(invite, first)");
    expect(sheet).toContain("inviteSheetCopy(");
  });
  it("assign and invite opens the sheet when the email couldn't go out (no toast that says sent)", () => {
    const panel = readFileSync(new URL("../../components/coach/AssignPanel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("setShareLink({ email: inv.email, emailed: false");
    expect(panel).toContain("<InviteSheet");
    expect(panel).not.toMatch(/Invite link ready to share/);
  });
});

describe("one sender, set by EMAIL_FROM", () => {
  it("Resend's test sender until a domain is set; the env value when it is; nonsense ignored", () => {
    expect(emailFrom({})).toBe(RESEND_TEST_SENDER);
    expect(emailFrom({ EMAIL_FROM: "Atlas <hello@atlas.app>" })).toBe("Atlas <hello@atlas.app>");
    expect(emailFrom({ EMAIL_FROM: "hello@atlas.app" })).toBe("hello@atlas.app");
    expect(emailFrom({ EMAIL_FROM: "not an address" })).toBe(RESEND_TEST_SENDER);
  });
  it("no sender address is written anywhere else", () => {
    for (const f of ["lib/email.ts", "lib/auth.ts", "lib/clients/invite.ts"]) {
      const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
      expect(src, f).not.toContain("onboarding@resend.dev");
      expect(src, f).toContain("emailFrom()");
    }
  });
});
