import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("You: the demo's AI-assistant link is in How it works, not its own row", () => {
  it("is no longer a row on You", () => {
    expect(src("components/athlete/YouScreen.tsx")).not.toContain("Watch an AI assistant");
    expect(src("components/athlete/YouScreen.tsx")).toContain("aiDemo={athlete.isDemo}");
  });
  it("is the last step of the How it works sheet, for the demo only", () => {
    const s = src("components/HowItWorks.tsx");
    expect(s).toContain("aiDemo && step === last");
    expect(s).toContain("/agents#demo");
  });
});
