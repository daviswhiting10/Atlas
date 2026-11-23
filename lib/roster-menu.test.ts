import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const roster = readFileSync(new URL("../app/(dashboard)/clients/page.tsx", import.meta.url), "utf8");

describe("the roster's ⋯ menu", () => {
  const menu = roster.slice(roster.indexOf("<DropdownMenu>"), roster.indexOf("</DropdownMenu>"));
  it("every row has one, and it is for a desktop only (a phone keeps the swipe)", () => {
    expect(menu).toContain("hidden");
    expect(menu).toContain("md:flex");
    expect(roster).toContain("<SwipeRow");
  });
  it("it holds Delete client, which runs the same action as the swipe (so the same confirm sheet)", () => {
    expect(menu).toContain("Delete client");
    expect(menu).toContain("void askDelete(client.id)");
    expect(roster).toContain("onDelete={() => void askDelete(client.id)}");
    expect(roster).toContain("<DeleteClientSheet");
  });
  it("the button and the item are 44 px targets and the button is named for the client", () => {
    expect(menu).toContain("h-11 w-11");
    expect(menu).toContain("min-h-11");
    expect(menu).toContain("aria-label={`More for ${client.fullName}`}");
  });
});
