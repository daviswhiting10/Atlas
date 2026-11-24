import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("the Programs page is the filterable, collapsed library", () => {
  const lib = read("components/programs/ProgramLibrary.tsx");
  it("search, the four filters, and a closed-by-default category list", () => {
    expect(lib).toContain("Search programs");
    for (const w of ['chip("goals"', 'chip("perWeek"', 'chip("length"', "Used by a client"]) expect(lib).toContain(w);
    expect(lib).toContain("const isOpen = (tag: string) => filtering || s.open.includes(tag);");
  });
  it("remembers the filters and the open categories per person, in this browser", () => {
    expect(lib).toContain("loadState(user)");
    expect(lib).toContain("saveState(user, s)");
    expect(read("lib/programs/filter.ts")).toContain("atlas.programs.filters.${user}");
  });
  it("the page sends plain data to it", () => {
    const page = read("app/(dashboard)/programs/page.tsx");
    expect(page).toContain("<ProgramLibrary programs={programs}");
    expect(page).toContain("user={session?.user?.id");
  });
});
