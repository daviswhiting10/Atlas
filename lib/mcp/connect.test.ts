import { describe, expect, it } from "vitest";
import { claudeCodeCommand, mcpUrl, shellQuote, shortDate, tokenLine } from "@/lib/mcp/connect";

describe("claudeCodeCommand", () => {
  it("adds an HTTP server named atlas at origin + /api/mcp with a bearer header", () => {
    expect(claudeCodeCommand("https://atlas.example.app", "atlas_mcp_abc")).toBe(
      "claude mcp add --transport http --scope user atlas 'https://atlas.example.app/api/mcp' --header 'Authorization: Bearer atlas_mcp_abc'"
    );
  });
  it("drops a trailing slash on the origin and keeps a port", () => {
    expect(mcpUrl("http://localhost:3000/")).toBe("http://localhost:3000/api/mcp");
  });
  it("quotes anything a shell would split or expand", () => {
    expect(shellQuote("a b$HOME`x`")).toBe("'a b$HOME`x`'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(claudeCodeCommand("https://x.app", "t'k")).toContain(`--header 'Authorization: Bearer t'\\''k'`);
  });
});

describe("date labels", () => {
  const now = new Date(2026, 10, 27, 12);
  it("shows month and day this year, and the year otherwise", () => {
    expect(shortDate(new Date(2026, 10, 3, 9).toISOString(), now)).toBe("Nov 3");
    expect(shortDate(new Date(2025, 0, 15, 9).toISOString(), now)).toBe("Jan 15, 2025");
  });
  it("says Never used, Last used, or Revoked", () => {
    const created = new Date(2026, 10, 25, 9).toISOString();
    expect(tokenLine({ createdAt: created, lastUsedAt: null, revokedAt: null }, now)).toBe("Created Nov 25 · Never used");
    expect(tokenLine({ createdAt: created, lastUsedAt: new Date(2026, 10, 27, 8).toISOString(), revokedAt: null }, now)).toBe("Created Nov 25 · Last used Nov 27");
    expect(tokenLine({ createdAt: created, lastUsedAt: null, revokedAt: new Date(2026, 10, 26, 8).toISOString() }, now)).toBe("Revoked Nov 26");
  });
});
