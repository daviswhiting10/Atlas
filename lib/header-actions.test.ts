import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headerActions, headerSlots } from "./header-actions";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("headerActions: the same on both sides", () => {
  it("on desktop a coach gets Settings, Sign out and the toggle on the Coach side and on the Me side, in the same order", () => {
    const coach = headerActions({ side: "coach", demo: false, isCoach: true });
    const me = headerActions({ side: "me", demo: false, isCoach: true });
    expect(coach.desktop).toEqual(["settings", "signout", "mode"]);
    // The Me side adds its ⋯ (Add body weight, Demo) before the toggle.
    expect(me.desktop).toEqual(["settings", "signout", "account", "mode"]);
  });
  it("the demo chip comes first, on both sides", () => {
    expect(headerActions({ side: "me", demo: true, isCoach: true }).desktop).toEqual(["demo", "settings", "signout", "account", "mode"]);
    expect(headerActions({ side: "coach", demo: true, isCoach: true }).desktop).toEqual(["demo", "settings", "signout", "mode"]);
  });
  it("on a phone the Me side has one Account menu (Settings and Sign out); the coach side already has More", () => {
    expect(headerActions({ side: "me", demo: false, isCoach: true }).phone).toEqual(["account", "mode"]);
    expect(headerActions({ side: "coach", demo: false, isCoach: true }).phone).toEqual(["mode"]);
  });
  it("the demo chip stays visible on a phone, on both sides", () => {
    expect(headerActions({ side: "me", demo: true, isCoach: true }).phone[0]).toBe("demo");
    expect(headerActions({ side: "coach", demo: true, isCoach: true }).phone[0]).toBe("demo");
  });
  it("a client of a coach has only the athlete app: no toggle, no Settings, no Sign out up here; the ⋯ (body weight, Demo)", () => {
    expect(headerActions({ side: "me", demo: false, isCoach: false })).toEqual({ desktop: ["account"], phone: ["account"] });
    expect(headerActions({ side: "me", demo: true, isCoach: false })).toEqual({ desktop: ["demo", "account"], phone: ["demo", "account"] });
  });
});

describe("headerSlots: every action once, shown where it belongs", () => {
  const where = (side: "coach" | "me", demo = false) => Object.fromEntries(headerSlots({ side, demo, isCoach: true }).map((s) => [s.action, s.where]));
  it("the Me side: Settings and Sign out on desktop, the ⋯ menu and the toggle everywhere", () => {
    expect(where("me")).toEqual({ settings: "desktop", signout: "desktop", account: "both", mode: "both" });
  });
  it("the Coach side: the same on desktop; nothing extra on a phone (More has them)", () => {
    expect(where("coach")).toEqual({ settings: "desktop", signout: "desktop", mode: "both" });
  });
  it("the chip shows everywhere when it shows at all", () => expect(where("me", true).demo).toBe("both"));
  it("desktop order is the same on both sides", () => {
    const order = (side: "coach" | "me") => headerSlots({ side, demo: true, isCoach: true }).filter((s) => s.where !== "phone" && s.action !== "account").map((s) => s.action);
    expect(order("me")).toEqual(order("coach"));
  });
  it("no action appears twice", () => {
    const a = headerSlots({ side: "me", demo: true, isCoach: true }).map((s) => s.action);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("both headers use the one component", () => {
  const app = read("components/athlete/AppNav.tsx");
  const coach = read("components/coach/CoachNav.tsx");
  const shared = read("components/nav/HeaderActions.tsx");
  it("AppNav and CoachNav each render HeaderActions", () => {
    expect(app).toContain("<HeaderActions side=\"me\"");
    expect(coach).toContain("<HeaderActions side=\"coach\"");
  });
  it("neither keeps its own gear, sign-out icon or toggle", () => {
    for (const src of [app, coach]) {
      expect(src).not.toMatch(/<Settings\b/);
      expect(src).not.toMatch(/<LogOut\b/);
      expect(src).not.toContain("<ModeToggle");
      expect(src).not.toContain("<DemoChip");
    }
  });
  it("the shared actions are 44 px targets, and follow the pure list", () => {
    expect(shared).toContain("h-11 w-11");
    expect(shared).toContain("headerSlots(");
    expect(shared).toContain('aria-label="Settings"');
    expect(shared).toContain('aria-label="Sign out"');
    expect(shared).toContain('aria-label="Account"');
  });
  it("Sign out is one function: the same for the header, the Account menu and the More sheet", () => {
    expect(shared).toContain("signOutToLogin");
    expect(coach).toContain("signOutToLogin");
    expect(coach).not.toContain("async function signOut");
  });
  it("every menu item is at least 44 px tall", () => {
    const items = shared.match(/<DropdownMenuItem\b[^>]*>/g) ?? [];
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const i of items) expect(i).toContain("min-h-11");
  });
  it("the demo chip is short on a phone (so the Me header isn't cramped) but still reads Demo data to a screen reader", () => {
    const chip = read("components/DemoChip.tsx");
    expect(chip).toContain("max-sm:sr-only");
    expect(chip).toMatch(/Demo<span[^>]*> data<\/span>/);
  });
});
