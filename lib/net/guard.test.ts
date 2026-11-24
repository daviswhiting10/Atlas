import { describe, expect, it, vi } from "vitest";
import { NO_CONNECTION, SOMETHING_WENT_WRONG, createdSince, guard, guardActions } from "./guard";

const offlineError = () => new TypeError("Failed to fetch");

describe("guard: a save that can't reach the server", () => {
  it("says there's no connection, and nothing was changed", async () => {
    const r = await guard(async () => {
      throw offlineError();
    });
    expect(r).toEqual({ ok: false, error: NO_CONNECTION, offline: true });
  });
  it("lets the server's own answer through, refusal or not", async () => {
    expect(await guard(async () => ({ ok: true as const }))).toEqual({ ok: true });
    expect(await guard(async () => ({ ok: false as const, error: "That draft has already been assigned or removed." }))).toEqual({ ok: false, error: "That draft has already been assigned or removed." });
  });
  it("a crash on the server is a sentence, not a silent tap", async () => {
    const r = await guard(async () => {
      throw new Error("An error occurred in the Server Components render.");
    });
    expect(r).toEqual({ ok: false, error: SOMETHING_WENT_WRONG });
  });
  it("guards every action in a set and leaves missing ones out", async () => {
    const calls: string[] = [];
    const g = guardActions({
      a: async (x: number) => {
        calls.push("a" + x);
        return { ok: true as const };
      },
      b: async () => {
        throw offlineError();
      },
      c: undefined as undefined | (() => Promise<{ ok: true }>),
    });
    expect(await g.a(1)).toEqual({ ok: true });
    expect(await g.b()).toMatchObject({ ok: false, offline: true });
    expect(g.c).toBeUndefined();
    expect(calls).toEqual(["a1"]);
  });
  it("re-reads the page when the connection returns, once, however many saves failed", async () => {
    const listeners: Array<() => void> = [];
    vi.stubGlobal("window", { addEventListener: (_: string, fn: () => void) => listeners.push(fn) });
    const refresh = vi.fn();
    const g = guardActions(
      {
        save: async () => {
          throw offlineError();
        },
      },
      refresh
    );
    await g.save();
    await g.save();
    expect(listeners).toHaveLength(1);
    listeners[0]();
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("createdSince: adding a client again after the answer was lost", () => {
  const roster = [
    { id: "1", fullName: "Dana Reyes", email: "Dana@Example.com", createdAt: "2026-11-24T02:00:10Z" },
    { id: "2", fullName: "Dana Reyes", email: null, createdAt: "2026-11-20T10:00:00Z" },
  ];
  const since = Date.parse("2026-11-24T02:00:08Z");
  it("finds the copy made by the first try (same name and email, created since)", () => {
    expect(createdSince(roster, { fullName: " dana reyes ", email: "dana@example.com" }, since)?.id).toBe("1");
  });
  it("is not fooled by an older client with the same name", () => {
    expect(createdSince(roster, { fullName: "Dana Reyes" }, since)).toBeNull();
  });
  it("finds nothing when the first try never arrived", () => {
    expect(createdSince(roster, { fullName: "Someone Else" }, since)).toBeNull();
  });
});
