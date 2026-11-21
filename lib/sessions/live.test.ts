import { describe, expect, it } from "vitest";
import { LIVE_KEY, LIVE_MAX_MS, clearLive, liveIsFresh, formatElapsed, mergeDraft, readLive, startLive, writeLive, type LiveSession } from "./live";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

const base = { assignedWorkoutId: "aw1", clientId: "c1", clientName: "Sam Lee", workoutName: "Day 1", href: "/clients/c1/log?workoutId=aw1", workoutLogId: null };

describe("live session store", () => {
  it("writes, reads and clears", () => {
    const s = memory();
    const live = startLive(null, base, 1_000);
    writeLive(s, live);
    expect(readLive(s, 2_000)).toEqual(live);
    clearLive(s, "other-workout");
    expect(readLive(s, 2_000)).not.toBeNull();
    clearLive(s, "aw1");
    expect(readLive(s, 2_000)).toBeNull();
  });

  it("drops a session left open too long, and anything malformed", () => {
    const s = memory();
    writeLive(s, startLive(null, base, 0));
    expect(readLive(s, LIVE_MAX_MS + 1)).toBeNull();
    expect(s.m.has(LIVE_KEY)).toBe(false);
    s.setItem(LIVE_KEY, "{not json");
    expect(readLive(s)).toBeNull();
    s.setItem(LIVE_KEY, JSON.stringify({ ...startLive(null, base), href: "https://evil.example" }));
    expect(readLive(s)).toBeNull();
    expect(readLive(null)).toBeNull();
  });

  it("keeps the start time and place when the same workout is reopened, and starts fresh for another", () => {
    const first = { ...startLive(null, base, 1_000), scrollY: 640, order: [{ aweId: "a", section: "block:1" }] };
    const again = startLive(first, { ...base, workoutLogId: "wl1" }, 9_000);
    expect(again).toMatchObject({ startedAt: 1_000, updatedAt: 9_000, scrollY: 640, order: [{ aweId: "a", section: "block:1" }], workoutLogId: "wl1" });
    const other = startLive(first, { ...base, assignedWorkoutId: "aw2" }, 9_000);
    expect(other).toMatchObject({ startedAt: 9_000, scrollY: 0, order: null, draft: null });
  });
});

describe("mergeDraft", () => {
  const server = {
    x1: { sets: [{ setLogId: "s1", completed: true, weight: "100" }, { setLogId: null, completed: false, weight: "" }], noteInput: "" },
    x2: { sets: [{ setLogId: null, completed: false, weight: "" }], noteInput: "" },
  };
  const live = (draft: LiveSession["draft"], extra: Partial<LiveSession> = {}): LiveSession => ({ ...startLive(null, base), draft, ...extra });

  it("puts back typed values the database doesn't have, and never overrides a saved set", () => {
    const merged = mergeDraft(server, live({
      x1: { sets: [{ setLogId: null, completed: false, weight: "999" }, { setLogId: null, completed: false, weight: "105" }, { setLogId: null, completed: false, weight: "110" }], noteInput: "felt easy" },
    }), { assignedWorkoutId: "aw1", workoutLogId: "wl1" });
    expect(merged.x1.sets.map((s) => s.weight)).toEqual(["100", "105", "110"]);
    expect(merged.x1.sets[0].setLogId).toBe("s1");
    expect(merged.x1.noteInput).toBe("felt easy");
    expect(merged.x2).toBe(server.x2);
  });

  it("unticks a set whose save never came back", () => {
    const merged = mergeDraft(server, live({ x2: { sets: [{ setLogId: null, completed: true, saving: true, weight: "50" }] } }), { assignedWorkoutId: "aw1", workoutLogId: null });
    expect(merged.x2.sets[0]).toMatchObject({ weight: "50", completed: false, saving: false, setLogId: null });
  });

  it("drops a draft set the database has since removed", () => {
    const merged = mergeDraft(server, live({ x2: { sets: [{ setLogId: null, completed: false, weight: "" }, { setLogId: "gone", completed: true, weight: "60" }] } }), { assignedWorkoutId: "aw1", workoutLogId: null });
    expect(merged.x2.sets).toHaveLength(1);
  });

  it("ignores a draft from another workout or another session", () => {
    const d = { x1: { sets: [{ setLogId: null, completed: false, weight: "1" }] } };
    expect(mergeDraft(server, live(d, { assignedWorkoutId: "aw9" }), { assignedWorkoutId: "aw1", workoutLogId: null })).toBe(server);
    expect(mergeDraft(server, live(d, { workoutLogId: "old" }), { assignedWorkoutId: "aw1", workoutLogId: "new" })).toBe(server);
    expect(mergeDraft(server, null, { assignedWorkoutId: "aw1", workoutLogId: null })).toBe(server);
  });
});

describe("formatElapsed", () => {
  it("shows minutes and seconds, and hours when there are some", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(245_000)).toBe("4:05");
    expect(formatElapsed(3_729_000)).toBe("1:02:09");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});

describe("idle limit", () => {
  it("drops a session untouched for 3 hours, counting from the last activity, not the start", () => {
    expect(LIVE_MAX_MS).toBe(3 * 60 * 60_000);
    const started = { updatedAt: 0 };
    expect(liveIsFresh(started, 3 * 60 * 60_000 - 1)).toBe(true);
    expect(liveIsFresh(started, 3 * 60 * 60_000)).toBe(false);
    // Busy for 5 hours (last touched at 4h50): still live.
    expect(liveIsFresh({ updatedAt: 4 * 3600_000 + 50 * 60_000 }, 5 * 3600_000)).toBe(true);
  });
});

describe("a live session belongs to the coach who started it", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  const session = (owner?: string): LiveSession => ({ owner, assignedWorkoutId: "w1", clientId: "c1", clientName: "Chris", workoutName: "Upper A", href: "/clients/c1/log?workoutId=w1", startedAt: Date.now(), updatedAt: Date.now(), workoutLogId: null, scrollY: 0, draft: null });

  it("shows only for its owner; another account on the same browser never sees it, and it's cleared", async () => {
    const { readLiveFor } = await import("./live");
    const s = mem();
    writeLive(s, session("coach-a"));
    expect(readLiveFor(s, "coach-a")?.clientName).toBe("Chris");
    expect(readLiveFor(s, "coach-b")).toBeNull();
    expect(s.m.has(LIVE_KEY)).toBe(false);
  });
  it("one saved before sessions had an owner is treated as someone else's", async () => {
    const { readLiveFor } = await import("./live");
    const s = mem();
    writeLive(s, session(undefined));
    expect(readLiveFor(s, "coach-a")).toBeNull();
  });
  it("sign-out forgets it", async () => {
    const { forgetLive, readLiveFor } = await import("./live");
    const s = mem();
    writeLive(s, session("coach-a"));
    forgetLive(s);
    expect(readLiveFor(s, "coach-a")).toBeNull();
  });
});
