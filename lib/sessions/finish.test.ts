import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { finishAction, sendFinish, unloggedText } from "./finish";
import { queuedFinish } from "./pending-finish";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const offline = (e: unknown) => e instanceof Error && e.message === "offline";

describe("finishAction", () => {
  it("does nothing when no set is logged", () => {
    expect(finishAction([[false, false], [false]])).toEqual({ kind: "none" });
    expect(finishAction([])).toEqual({ kind: "none" });
  });
  it("finishes at once when every set is logged", () => {
    expect(finishAction([[true, true], [true]])).toEqual({ kind: "now" });
  });
  it("asks once, with the count, when some sets are not logged", () => {
    expect(finishAction([[true, false], [false, false]])).toEqual({ kind: "confirm", unlogged: 3 });
    expect(unloggedText(3)).toBe("3 sets not logged");
    expect(unloggedText(1)).toBe("1 set not logged");
  });
});

describe("sendFinish", () => {
  it("completes at once and leaves nothing queued", async () => {
    const storage = mem();
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await sendFinish({ send, storage, workoutId: "w", minutes: 42, isOffline: offline })).toEqual({ kind: "done", minutes: 42 });
    expect(send).toHaveBeenCalledWith(42);
    expect(queuedFinish(storage, "w")).toBeNull();
  });
  it("offline: queues with the session length, then completes on reconnect with that same length", async () => {
    const storage = mem();
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await sendFinish({ send: down, storage, workoutId: "w", minutes: 40, isOffline: offline })).toEqual({ kind: "queued" });
    expect(queuedFinish(storage, "w")).toEqual({ minutes: 40 });
    const up = vi.fn().mockResolvedValue(undefined);
    expect(await sendFinish({ send: up, storage, workoutId: "w", minutes: 90, isOffline: offline })).toEqual({ kind: "done", minutes: 40 });
    expect(up).toHaveBeenCalledWith(40);
    expect(queuedFinish(storage, "w")).toBeNull();
  });
  it("offline twice keeps the first queued length", async () => {
    const storage = mem();
    const down = vi.fn().mockRejectedValue(new Error("offline"));
    await sendFinish({ send: down, storage, workoutId: "w", minutes: 40, isOffline: offline });
    await sendFinish({ send: down, storage, workoutId: "w", minutes: 55, isOffline: offline });
    expect(queuedFinish(storage, "w")).toEqual({ minutes: 40 });
  });
  it("a server error is a failure, not queued", async () => {
    const storage = mem();
    const bad = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await sendFinish({ send: bad, storage, workoutId: "w", minutes: 40, isOffline: offline })).toEqual({ kind: "failed" });
    expect(queuedFinish(storage, "w")).toBeNull();
  });
});

describe("the athlete logger's Finish", () => {
  const src = readFileSync(new URL("../../components/athlete/WorkoutLogger.tsx", import.meta.url), "utf8");
  it("has a visible Finish button, not one inside the ⋯ menu", () => {
    expect(src).toContain("Finish now?");
    expect(src).not.toMatch(/<DropdownMenuItem[^>]*>\s*Finish/);
    expect(src).not.toContain('scheduleFinish("Finishing workout")');
  });
  it("clears the rest timer when Finish is tapped", () => {
    expect(src).toMatch(/function tapFinish[\s\S]{0,400}setRest\(null\)/);
  });
});
