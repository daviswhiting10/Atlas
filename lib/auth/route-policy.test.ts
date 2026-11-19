import { describe, expect, it } from "vitest";
import { decide, mergeCookieHeader, needsRecheck } from "./route-policy";

const coach = { role: "TRAINER", needsPassword: false };
const athlete = { role: "CLIENT", needsPassword: false };
const go = (to: string) => ({ kind: "redirect", to });
const next = { kind: "next" };

describe("decide: signed out", () => {
  it("lets the public pages through, including the two password pages", () => {
    for (const p of ["/", "/start", "/login", "/error", "/agents", "/forgot-password", "/reset-password"]) expect(decide(p, null)).toEqual(next);
  });
  it("sends everything else to sign in, and answers APIs with 401", () => {
    expect(decide("/today", null)).toEqual(go("/login"));
    expect(decide("/set-password", null)).toEqual(go("/login"));
    expect(decide("/api/clients", null)).toEqual({ kind: "json", status: 401, error: "Unauthorized" });
  });
  it("doesn't treat a look-alike path as public", () => {
    expect(decide("/login-admin", null)).toEqual(go("/login"));
  });
});

describe("decide: signed in", () => {
  it("lets either role read the shared pages", () => {
    for (const u of [coach, athlete]) for (const p of ["/forgot-password", "/reset-password", "/error", "/agents"]) expect(decide(p, u)).toEqual(next);
  });
  it("sends the marketing and sign-in pages home", () => {
    expect(decide("/login", coach)).toEqual(go("/log"));
    expect(decide("/", athlete)).toEqual(go("/today"));
  });
  it("keeps athletes in the athlete app (and /api/mcp)", () => {
    expect(decide("/today", athlete)).toEqual(next);
    expect(decide("/clients", athlete)).toEqual(go("/today"));
    expect(decide("/api/mcp", athlete)).toEqual(next);
    expect(decide("/api/clients", athlete)).toEqual({ kind: "json", status: 403, error: "Forbidden" });
  });
  it("lets both roles open goals: Start a goal and a goal's chapter", () => {
    for (const u of [coach, athlete]) for (const p of ["/goals/new", "/goals/clx9abc123", "/goals"]) expect(decide(p, u)).toEqual(next);
  });
  it("opens goals and nothing else to athletes: look-alikes, the coach side and every API stay closed", () => {
    for (const p of ["/goalsx", "/goals-admin", "/goal", "/clients", "/clients/abc/goals", "/programs", "/log", "/inbox", "/exercises", "/intake", "/settings", "/sessions", "/leads", "/outreach"]) {
      expect(decide(p, athlete)).toEqual(go("/today"));
    }
    expect(decide("/api/goals", athlete)).toEqual({ kind: "json", status: 403, error: "Forbidden" });
    expect(decide("/api/clients", athlete)).toEqual({ kind: "json", status: 403, error: "Forbidden" });
    expect(decide("/api/mcp", athlete)).toEqual(next);
  });
  it("is unchanged for a signed-out visitor: goals still need sign-in", () => {
    expect(decide("/goals/new", null)).toEqual(go("/login"));
    expect(decide("/goals/clx9abc123", null)).toEqual(go("/login"));
  });
  it("sends anyone who doesn't need the step away from /set-password", () => {
    expect(decide("/set-password", coach)).toEqual(go("/log"));
    expect(decide("/set-password", athlete)).toEqual(go("/today"));
  });
});

describe("decide: the set-password step", () => {
  const coachStep = { ...coach, needsPassword: true };
  const athleteStep = { ...athlete, needsPassword: true };

  it("sends every page to /set-password, for either role", () => {
    for (const u of [coachStep, athleteStep]) {
      for (const p of ["/", "/login", "/today", "/log", "/clients/abc", "/you/settings", "/goals/new"]) expect(decide(p, u)).toEqual(go("/set-password"));
    }
  });
  it("lets the step itself through, for athletes too", () => {
    expect(decide("/set-password", athleteStep)).toEqual(next);
    expect(decide("/set-password", coachStep)).toEqual(next);
  });
  it("leaves APIs and the shared pages alone", () => {
    expect(decide("/api/mcp", athleteStep)).toEqual(next);
    expect(decide("/api/clients", coachStep)).toEqual(next);
    expect(decide("/error", athleteStep)).toEqual(next);
    expect(decide("/reset-password", athleteStep)).toEqual(next);
  });
});

describe("needsRecheck", () => {
  const now = Date.parse("2026-11-15T10:00:00Z");
  it("re-checks a cookie that has never been checked (sessions from before the deploy)", () => {
    expect(needsRecheck(undefined, now)).toBe(true);
    expect(needsRecheck("123", now)).toBe(true);
  });
  it("re-checks after 10 minutes, not before", () => {
    expect(needsRecheck(now - 10 * 60_000, now)).toBe(false);
    expect(needsRecheck(now - 10 * 60_000 - 1, now)).toBe(true);
    expect(needsRecheck(now - 1000, now)).toBe(false);
  });
});

describe("mergeCookieHeader", () => {
  const now = Date.parse("2026-11-15T10:00:00Z");

  it("replaces a refreshed cookie and keeps the others", () => {
    const out = mergeCookieHeader("theme=dark; authjs.session-token=OLD", ["authjs.session-token=NEW; Path=/; HttpOnly; SameSite=Lax; Expires=Fri, 14 May 2027 10:00:00 GMT"], now);
    expect(out).toBe("theme=dark; authjs.session-token=NEW");
  });

  it("drops cookies the response clears (a signed-out session)", () => {
    const out = mergeCookieHeader("theme=dark; authjs.session-token=OLD", ["authjs.session-token=; Path=/; Max-Age=0"], now);
    expect(out).toBe("theme=dark");
    expect(mergeCookieHeader("a=1; b=2", ["b=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT"], now)).toBe("a=1");
  });

  it("handles a session split into chunks becoming one cookie", () => {
    const out = mergeCookieHeader("authjs.session-token.0=A; authjs.session-token.1=B", [
      "authjs.session-token=WHOLE; Path=/",
      "authjs.session-token.0=; Max-Age=0",
      "authjs.session-token.1=; Max-Age=0",
    ], now);
    expect(out).toBe("authjs.session-token=WHOLE");
  });

  it("keeps values that contain '='", () => {
    expect(mergeCookieHeader("", ["t=abc==; Path=/"], now)).toBe("t=abc==");
  });
});

describe("decide: guests and the demo", () => {
  const demoCoach = { role: "TRAINER", needsPassword: false, guest: true };
  const guestAthlete = { role: "CLIENT", needsPassword: false, guest: true };
  const no = { kind: "json", status: 403, error: "Not available in the demo" };
  it("can't send an invite, call AI, upload, or reach outreach, leads or MCP", () => {
    for (const p of ["/api/clients/abc/invite", "/api/clients/abc/plan-from-sheet", "/api/ai/program-generate", "/api/ai", "/api/exercise-media/upload", "/api/outreach", "/api/leads/x", "/api/mcp"]) expect(decide(p, demoCoach)).toEqual(no);
    expect(decide("/api/mcp", guestAthlete)).toEqual(no);
  });
  it("keeps everything else in their own workspace", () => {
    expect(decide("/api/clients", demoCoach)).toEqual(next);
    expect(decide("/api/clients/abc", demoCoach)).toEqual(next);
    expect(decide("/api/programs", demoCoach)).toEqual(next);
    expect(decide("/log", demoCoach)).toEqual(next);
    expect(decide("/today", demoCoach)).toEqual(next);
  });
  it("leaves real accounts alone", () => {
    expect(decide("/api/clients/abc/invite", coach)).toEqual(next);
    expect(decide("/api/ai/program-generate", coach)).toEqual(next);
  });
});
