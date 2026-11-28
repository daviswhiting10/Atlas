import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const r = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
describe("⋯ menu: Connect your AI", () => {
  const h = r("components/nav/HeaderActions.tsx");
  it("goes to Settings for a coach and You for an athlete, at #connect-ai", () => {
    expect(h).toContain('goConnect(isCoach ? "/settings" : "/you")');
    expect(h).toContain("router.push(`${path}#connect-ai`)");
  });
  it("on the page itself it fires the hash change the section listens for (a client navigation to the same hash doesn't)", () => {
    expect(h).toContain("new HashChangeEvent(\"hashchange\")");
    expect(r("components/settings/ConnectAI.tsx")).toContain('addEventListener("hashchange"');
  });
  it("hidden for a guest and the demo, like the section", () => {
    expect(r("app/(client)/layout.tsx")).toContain("canConnect={!athlete.isGuest && !athlete.isDemo}");
    expect(r("components/athlete/AppNav.tsx")).toContain("canConnect = false");
  });
});
