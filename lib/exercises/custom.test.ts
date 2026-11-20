import { describe, expect, it } from "vitest";
import { cleanName, customSlug, findInLibrary, MAX_NAME } from "./custom";

const lib = [
  { id: "1", name: "Handstand Walk" },
  { id: "2", name: "Bench Press", equipment: "barbell", muscles: ["chest"] },
  { id: "3", name: "Dumbbell Romanian Deadlift" },
  { id: "4", name: "Barbell Row" },
  { id: "5", name: "Push-Up" },
  { id: "6", name: "Face Pull" },
];

describe("cleanName", () => {
  it("collapses spaces and trims", () => expect(cleanName("  handstand    walk ")).toBe("Handstand Walk"));
  it("keeps casing the person chose", () => expect(cleanName("DB RDL")).toBe("DB RDL"));
  it("capitalises all-lowercase typing, after spaces, hyphens and brackets", () => expect(cleanName("single-arm (left) row")).toBe("Single-Arm (Left) Row"));
  it("rejects empty and whitespace-only names", () => {
    expect(cleanName("")).toBeNull();
    expect(cleanName("   \t \n ")).toBeNull();
    expect(cleanName(String.fromCharCode(0x200b, 0x200b))).toBeNull();
  });
  it("rejects a name with no letter or number", () => {
    expect(cleanName("!!!")).toBeNull();
    expect(cleanName("---")).toBeNull();
  });
  it("rejects anything that isn't text", () => {
    expect(cleanName(null)).toBeNull();
    expect(cleanName(undefined)).toBeNull();
    expect(cleanName(42)).toBeNull();
    expect(cleanName({ name: "x" })).toBeNull();
  });
  it("caps the length", () => expect(cleanName("a".repeat(500))!.length).toBe(MAX_NAME));
  it("strips control characters", () => expect(cleanName("Cable\u0000 Fly\u0007")).toBe("Cable Fly"));
  it("keeps numbers and accents", () => {
    expect(cleanName("3 way raise")).toBe("3 Way Raise");
    expect(cleanName("élan lift")).toBe("Élan Lift");
  });
});

describe("customSlug", () => {
  const ws = "clxxxxxxxxxxxxabcdef123456";
  it("is the same for the same name however it's typed", () => {
    const a = customSlug(ws, "Handstand Walk");
    expect(customSlug(ws, "handstand walks")).toBe(a);
    expect(customSlug(ws, "  HANDSTAND   WALK ")).toBe(a);
  });
  it("differs between workspaces and between names", () => {
    expect(customSlug(ws, "Handstand Walk")).not.toBe(customSlug("clyyyyyyyyyyyyabcdef999999", "Handstand Walk"));
    expect(customSlug(ws, "Handstand Walk")).not.toBe(customSlug(ws, "Handstand Hold"));
  });
  it("stays a safe, short slug", () => expect(customSlug(ws, "x".repeat(80))).toMatch(/^custom-[a-z0-9]+-[a-z0-9-]+$/));
});

describe("findInLibrary: duplicates", () => {
  it('"Handstand Walks" finds "Handstand Walk" and offers no Add', () => {
    const f = findInLibrary(lib, "Handstand Walks");
    expect(f.exact?.id).toBe("1");
    expect(f.addName).toBeNull();
  });
  it("ignores case and extra spaces", () => {
    expect(findInLibrary(lib, "  handstand    WALK ").exact?.id).toBe("1");
    expect(findInLibrary(lib, "BENCH  press").exact?.id).toBe("2");
  });
  it("sees hyphen and plural differences as the same", () => {
    expect(findInLibrary(lib, "push ups").exact?.id).toBe("5");
    expect(findInLibrary(lib, "pushup").exact?.id).toBe("5");
  });
  it("reads shorthand: db rdl is the dumbbell Romanian deadlift", () => expect(findInLibrary(lib, "db rdl").exact?.id).toBe("3"));
  it("offers Add when nothing matches exactly, with the tidy name", () => {
    const f = findInLibrary(lib, "turkish getup");
    expect(f.exact).toBeNull();
    expect(f.addName).toBe("Turkish Getup");
  });
  it("still offers Add on a partial match (Bench is not Bench Press), with the partial below", () => {
    const f = findInLibrary(lib, "bench");
    expect(f.exact).toBeNull();
    expect(f.addName).toBe("Bench");
    expect(f.results.map((r) => r.id)).toEqual(["2"]);
  });
  it("offers nothing for an empty or symbol-only query", () => {
    for (const q of ["", "   ", "!!"]) expect(findInLibrary(lib, q)).toEqual({ results: [], exact: null, close: [], addName: null });
  });
});

describe("findInLibrary: typos", () => {
  it('a typo shows the close match above Add: "handstnd walk"', () => {
    const f = findInLibrary(lib, "handstnd walk");
    expect(f.exact).toBeNull();
    expect(f.close.map((c) => c.id)).toEqual(["1"]);
    expect(f.addName).toBe("Handstnd Walk");
  });
  it('"barbel row" and "bench pres" are caught', () => {
    expect(findInLibrary(lib, "barbel row").close.map((c) => c.id)).toEqual(["4"]);
    expect(findInLibrary(lib, "bnch press").close.map((c) => c.id)).toEqual(["2"]);
  });
  it("short names never count as typos of each other (row vs raw)", () => expect(findInLibrary([{ id: "a", name: "Row" }], "raw").close).toEqual([]));
  it("a name one letter short is offered as close, not repeated in the results", () => {
    const f = findInLibrary(lib, "handstand wal");
    expect(f.close.map((r) => r.id)).toEqual(["1"]);
    expect(f.results).toEqual([]);
  });
  it("a longer name that starts with the text is a result, not a typo", () => {
    const f = findInLibrary(lib, "handstand");
    expect(f.results.map((r) => r.id)).toEqual(["1"]);
    expect(f.close).toEqual([]);
  });
  it("a different exercise is not offered as a typo", () => expect(findInLibrary(lib, "face push").close).toEqual([]));
});

describe("findInLibrary: search as you type", () => {
  it("matches the start of any word", () => expect(findInLibrary(lib, "rom dead").results.map((r) => r.id)).toEqual(["3"]));
  it("matches equipment and muscle", () => {
    expect(findInLibrary(lib, "chest").results.map((r) => r.id)).toEqual(["2"]);
    expect(findInLibrary(lib, "barbell").results.map((r) => r.id).sort()).toEqual(["2", "4"]);
  });
  it("puts names that start with the text first, then the shortest", () => {
    const l = [{ id: "a", name: "Incline Bench Press" }, { id: "b", name: "Bench Press" }, { id: "c", name: "Bench" }];
    expect(findInLibrary(l, "bench").results.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
  it("respects the limit", () => expect(findInLibrary(Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Curl ${i}` })), "curl", 10).results).toHaveLength(10));
});
