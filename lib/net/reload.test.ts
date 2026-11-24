import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the app does not reload itself when the connection returns", () => {
  it("reloadOnOnline is off (a reload wipes a half-typed form and every open sheet)", () => {
    const s = readFileSync(new URL("../../next.config.mjs", import.meta.url), "utf8");
    expect(s).toMatch(/reloadOnOnline: false/);
    expect(s).not.toMatch(/reloadOnOnline: true/);
  });
});
