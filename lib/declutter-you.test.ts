import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("You: one screen, scannable", () => {
  const y = src("components/athlete/YouScreen.tsx");
  it("has no How it works, no Change goals / Close / Sign out buttons, no password panel, no goals wizard", () => {
    for (const gone of ["HowItWorks", "GoalsPanel", "SignOutButton", "PasswordPanel", "PlanWizard", "OwnProgramPicker"]) expect(y).not.toContain(gone);
  });
  it("is the person, the plan as one link, and Goals & challenges", () => {
    expect(y).toContain("Your plan");
    expect(y).toContain("href={`${base}/plan`}");
    expect(y).toContain("{challenges}");
  });
  it("an old /you?goals=1 link lands on New plan", () => {
    expect(src("app/(client)/you/page.tsx")).toContain('redirect("/plan/new")');
  });
  it("How it works stays where the demo link to the AI walkthrough is: its last step", () => {
    const s = src("components/HowItWorks.tsx");
    expect(s).toContain("aiDemo && step === last");
    expect(s).toContain("/agents#demo");
  });
});

describe("the ⋯ menu: Password and Sign out", () => {
  const h = src("components/nav/HeaderActions.tsx");
  it("an athlete signs out from the ⋯ menu (a guest is asked first); a real account can set a password there", () => {
    expect(h).toContain("An athlete's Sign out lives here only");
    expect(h).toContain("setLeaving(true)");
    expect(h).toContain("canPassword && !isCoach");
    expect(h).toContain("<PasswordSheet");
  });
  it("the layout offers the password only to a real account (not a guest, a demo or a coach)", () => {
    expect(src("app/(client)/layout.tsx")).toContain("canPassword={!athlete.isGuest && !athlete.isDemo && !athlete.isCoach}");
  });
});

describe("header sheets open on the page, not inside the header", () => {
  it("the Password and guest-leave sheets are drawn on <body>", () => {
    for (const f of ["components/athlete/PasswordSheet.tsx", "components/athlete/LeaveSheet.tsx"]) {
      const s = src(f);
      expect(s).toContain("createPortal(");
      expect(s).toContain("document.body");
    }
  });
  it("a long plan name wraps instead of being cut off on You", () => {
    expect(src("components/athlete/YouScreen.tsx")).not.toContain("truncate text-[20px]");
  });
});
