import { describe, expect, it } from "vitest";
import { ClientIdArg, Id, IsoDate, LoggedSetInput } from "./schemas";

describe("identifiers and dates are strict", () => {
  it("accepts cuid- and uuid-style ids", () => {
    for (const ok of ["cmp4cif4i000xtpb", "3d8ca6c27284406eab3a0cf92843043b", "ws_atlas_primary", "a-b_c"]) {
      expect(Id.safeParse(ok).success, ok).toBe(true);
    }
  });

  it("rejects anything that is not an id", () => {
    for (const bad of ["", "bad id!", "a/b", "x'; DROP TABLE", "a".repeat(65), 42, null]) {
      expect(Id.safeParse(bad).success, String(bad)).toBe(false);
    }
  });

  it("lets clientId be omitted but never malformed", () => {
    expect(ClientIdArg.safeParse(undefined).success).toBe(true);
    expect(ClientIdArg.safeParse("../other").success).toBe(false);
  });

  it("requires ISO dates", () => {
    expect(IsoDate.safeParse("2026-11-10").success).toBe(true);
    for (const bad of ["11/10/2026", "2026-11-10T00:00:00Z", "yesterday"]) expect(IsoDate.safeParse(bad).success, bad).toBe(false);
  });
});

describe("training values from an AI client are coerced, not rejected", () => {
  const base = { exerciseId: "ex_1", setNumber: 1 };

  it("keeps sensible values", () => {
    expect(LoggedSetInput.parse({ ...base, weight: 152.5, reps: 8, rpe: 8.5 })).toEqual({ ...base, weight: 152.5, reps: 8, rpe: 8.5 });
  });

  it("turns an out-of-range or mistyped value into null instead of failing the call", () => {
    expect(LoggedSetInput.parse({ ...base, weight: -20, reps: 8 })).toMatchObject({ weight: null, reps: 8 });
    expect(LoggedSetInput.parse({ ...base, weight: 99999, reps: "eight", rpe: 14 })).toMatchObject({ weight: null, reps: null, rpe: null });
  });

  it("treats a missing weight as bodyweight", () => {
    expect(LoggedSetInput.parse({ ...base, reps: 12 }).weight ?? null).toBeNull();
  });

  it("stays strict about which exercise and which set", () => {
    expect(LoggedSetInput.safeParse({ exerciseId: "not an id", setNumber: 1, reps: 8 }).success).toBe(false);
    expect(LoggedSetInput.safeParse({ ...base, setNumber: 0, reps: 8 }).success).toBe(false);
    expect(LoggedSetInput.safeParse({ ...base, setNumber: 500, reps: 8 }).success).toBe(false);
  });
});
