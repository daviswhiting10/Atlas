import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME, initial, modeOf, sync, tap, type SwitchState } from "./mode";

describe("modeOf", () => {
  it("the coach's screens are the coach side", () => {
    for (const p of ["/dashboard", "/log", "/clients", "/clients/abc/log", "/clients/abc/progress", "/programs", "/programs/x", "/exercises", "/intake", "/settings"]) expect(modeOf(p)).toBe("coach");
  });
  it("the athlete app is the Me side", () => {
    for (const p of ["/today", "/plan", "/progress", "/you", "/workouts/abc", "/workouts/new", "/goals/new", "/goals/abc"]) expect(modeOf(p)).toBe("me");
  });
  it("only whole path segments count (/logbook is not /log)", () => expect(modeOf("/logbook")).toBe("me"));
  it("each side opens on its home", () => expect([HOME.coach, HOME.me]).toEqual(["/dashboard", "/today"]));
});

describe("the toggle's state machine", () => {
  it("a tap shows the other side at once and starts one navigation", () => {
    const r = tap(initial("coach"), "me");
    expect(r.state).toEqual({ shown: "me", inflight: "me" });
    expect(r.go).toBe("me");
  });
  it("tapping the side already shown does nothing, however often", () => {
    let s = tap(initial("coach"), "me").state;
    for (let i = 0; i < 20; i++) {
      const r = tap(s, "me");
      expect(r.go).toBeNull();
      s = r.state;
    }
    expect(s).toEqual({ shown: "me", inflight: "me" });
  });
  it("tapping the side you're already on does nothing", () => expect(tap(initial("coach"), "coach")).toEqual({ state: initial("coach"), go: null }));
  it("arrival clears the wait and leaves it settled", () => {
    const s = tap(initial("coach"), "me").state;
    const r = sync(s, "me");
    expect(r.state).toEqual({ shown: "me", inflight: null });
    expect(r.go).toBeNull();
  });
  it("changing your mind mid-load: shows the new side at once, follows when the first lands", () => {
    const s = tap(initial("coach"), "me").state; // heading to Me
    const back = tap(s, "coach"); // …tapped Coach before it landed
    expect(back.state).toEqual({ shown: "coach", inflight: "me" });
    expect(back.go).toBeNull(); // no second navigation yet: it would race the first
    const landed = sync(back.state, "me");
    expect(landed.go).toBe("coach"); // now go back
    expect(landed.state).toEqual({ shown: "coach", inflight: "coach" });
    const home = sync(landed.state, "coach");
    expect(home.state).toEqual({ shown: "coach", inflight: null });
    expect(home.go).toBeNull();
  });
  it("20 taps alternating while loading always end on the last side asked for, one navigation at a time", () => {
    let s: SwitchState = initial("coach");
    let actual = "coach" as "coach" | "me";
    let inflightNavs = 0;
    const starts: string[] = [];
    const apply = (go: "coach" | "me" | null) => { if (go) { inflightNavs++; starts.push(go); } };
    for (let i = 0; i < 20; i++) {
      const target = i % 2 === 0 ? "me" : "coach";
      const r = tap(s, target);
      s = r.state;
      apply(r.go);
      expect(inflightNavs).toBeLessThanOrEqual(1); // never two at once
      if (i % 5 === 4 && s.inflight) { // a navigation lands now and then
        actual = s.inflight;
        const a = sync(s, actual);
        s = a.state;
        inflightNavs = 0;
        apply(a.go);
      }
    }
    // everything lands
    for (let n = 0; n < 4 && s.inflight; n++) { actual = s.inflight; const a = sync(s, actual); s = a.state; inflightNavs = 0; apply(a.go); }
    expect(s.inflight).toBeNull();
    expect(s.shown).toBe("coach"); // the 20th tap (i = 19) asked for coach
    expect(actual).toBe("coach");
  });
  it("moving some other way (a link inside the page) just syncs, no navigation", () => {
    const r = sync(initial("coach"), "me");
    expect(r.state).toEqual({ shown: "me", inflight: null });
    expect(r.go).toBeNull();
  });
  it("a navigation that ends somewhere unexpected doesn't leave it waiting", () => {
    const s = tap(initial("coach"), "me").state;
    const r = sync(s, "coach"); // the page is still on the coach side (it redirected, or failed)
    expect(r.state.inflight).toBe("me"); // the person still wants Me: try again once
    expect(r.go).toBe("me");
  });
});

describe("the toggle shell and the tab stack work together", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  it("the toggle leaves the pressed look to PressFeedback (no second copy of it)", () => {
    expect(read("components/ModeToggle.tsx")).not.toContain("onPointerDown");
  });
  it("a switch that hasn't landed falls back to a plain page load", () => {
    expect(read("components/mode/ModeSwitchProvider.tsx")).toContain("window.location.assign(HOME[to])");
  });
  it("the shell draws the same shared header actions as the real page (it renders the real navs)", () => {
    const p = read("components/mode/ModeSwitchProvider.tsx");
    expect(p).toContain("<AppNav");
    expect(p).toContain("<CoachNav");
  });
});
