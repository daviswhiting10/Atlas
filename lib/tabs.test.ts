import { describe, expect, it } from "vitest";
import { chosenTab, tapTab } from "./tabs";

describe("tapTab", () => {
  it("the first tap on another tab shows it at once and starts the navigation", () => {
    expect(tapTab(null, "/plan", false)).toEqual({ pending: "/plan", navigate: true });
  });
  it("a repeat tap while it loads does nothing, however many", () => {
    let s = tapTab(null, "/plan", false);
    for (let i = 0; i < 20; i++) {
      const r = tapTab(s.pending, "/plan", false);
      expect(r.navigate).toBe(false);
      s = r;
    }
    expect(s.pending).toBe("/plan");
  });
  it("a different tab is never held up: it takes over at once", () => {
    const r = tapTab("/plan", "/you", false);
    expect(r).toEqual({ pending: "/you", navigate: true });
  });
  it("tapping the tab the page is on goes back to it and clears the wait", () => {
    expect(tapTab("/plan", "/today", true)).toEqual({ pending: null, navigate: true });
    expect(tapTab(null, "/today", true)).toEqual({ pending: null, navigate: true }); // the usual refresh of the current tab
  });
  it("tapping around quickly always ends on the last tab tapped", () => {
    let pending: string | null = null;
    const last = ["/plan", "/you", "/plan", "/progress", "/you"];
    let started = 0;
    for (const href of last) {
      const r = tapTab(pending, href, href === "/today");
      pending = r.pending;
      if (r.navigate) started++;
    }
    expect(pending).toBe("/you");
    expect(started).toBe(5);
  });
});

describe("chosenTab", () => {
  it("shows the tapped tab as chosen before the page has moved", () => {
    expect(chosenTab("/plan", "/plan", false)).toBe(true);
    expect(chosenTab("/plan", "/today", true)).toBe(false); // the old one lets go at once
  });
  it("with nothing pending, follows the page", () => {
    expect(chosenTab(null, "/today", true)).toBe(true);
    expect(chosenTab(null, "/plan", false)).toBe(false);
  });
});
