import { describe, expect, it, vi } from "vitest";

// Nothing here connects; the route and token modules import the client, which wants a URL at import time.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
});

const session = vi.hoisted(() => ({ calls: 0, user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ auth: async () => (session.calls++, session.user ? { user: session.user } : null) }));
const tokens = vi.hoisted(() => ({ lookups: 0 }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    mcpToken: {
      // Every well-formed token is unknown here: the database tests cover real ones.
      findUnique: async () => (tokens.lookups++, null),
      updateMany: async () => ({ count: 0 }),
    },
  },
}));

import { bearerToken, generateToken, hashToken, TOKEN_PREFIX } from "./token";
import { MCP_ENDPOINT_PATH } from "./token-shared";

describe("tokens", () => {
  it("are the prefix and 32 random bytes, different every time", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a).toMatch(/^atlas_pat_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("are stored as a SHA-256 that doesn't contain the token", () => {
    const t = generateToken();
    const h = hashToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 8));
    expect(hashToken(t)).toBe(h);
  });

  it("are read only from a Bearer header of the right shape", () => {
    const t = generateToken();
    expect(bearerToken(`Bearer ${t}`)).toBe(t);
    expect(bearerToken(`bearer ${t}`)).toBe(t);
    for (const bad of [null, "", t, `Basic ${t}`, `Bearer`, `Bearer ${t} extra`, `Bearer ${t}x`, "Bearer atlas_pat_short", `Bearer ${t.replace("atlas_pat_", "other_pat_")}`]) {
      expect(bearerToken(bad), String(bad)).toBeNull();
    }
  });

  it("the endpoint path the settings page shows", () => {
    expect(MCP_ENDPOINT_PATH).toBe("/api/mcp");
  });
});

describe("/api/mcp: which way in", () => {
  const post = async (headers: Record<string, string>) => {
    const { POST } = await import("@/app/api/mcp/route");
    return POST(new Request("https://atlas.example/api/mcp", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" }));
  };

  it("an Authorization header means the token path only: a bad one is 401 and the session is never read", async () => {
    session.user = { id: "u1", role: "TRAINER", workspaceId: "ws1" };
    session.calls = 0;
    for (const h of ["Bearer nope", `Basic ${Buffer.from("a:b").toString("base64")}`, "", `Bearer ${generateToken()}`]) {
      const res = await post({ authorization: h, cookie: "authjs.session-token=whatever" });
      expect(res.status, h).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("Bearer");
      expect(await res.text()).toBe(JSON.stringify({ error: "Unauthorized" }));
    }
    expect(session.calls).toBe(0);
    // Malformed ones never reach the database; the well-formed unknown one does, once.
    expect(tokens.lookups).toBe(1);
  });

  it("a bearer request isn't refused for its origin (it carries no cookie credential)", async () => {
    const res = await post({ authorization: `Bearer ${generateToken()}`, origin: "https://evil.example" });
    expect(res.status).toBe(401);
  });

  it("the cookie path still refuses another origin, before reading the session", async () => {
    session.calls = 0;
    const res = await post({ origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(session.calls).toBe(0);
  });

  it("the cookie path without a session is 401", async () => {
    session.user = null;
    expect((await post({})).status).toBe(401);
  });
});
