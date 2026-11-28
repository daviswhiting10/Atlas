"use server";

// STUB for the UI branch. W1 replaces this file with the real one at merge.

type TokenRow = { id: string; name: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

export async function createMcpToken(raw: { name: string }): Promise<{ ok: true; id: string; token: string; name: string } | { ok: false; error: string }> {
  const name = raw.name.trim();
  if (!name) return { ok: false, error: "Give it a name." };
  return { ok: true, id: "tok_new", token: "atlas_mcp_3f9c1e7a2b8d4f60a1c5e9b7d2f48a6c", name };
}

export async function listMcpTokens(): Promise<TokenRow[]> {
  if (process.env.MCP_STUB_EMPTY === "1") return [];
  return [
    { id: "tok_2", name: "Claude on my laptop", createdAt: "2026-11-25T18:04:00.000Z", lastUsedAt: "2026-11-27T07:31:00.000Z", revokedAt: null },
    { id: "tok_1", name: "Old desktop", createdAt: "2026-11-02T10:00:00.000Z", lastUsedAt: null, revokedAt: "2026-11-20T09:12:00.000Z" },
  ];
}

export async function revokeMcpToken(raw: { id: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  return raw.id ? { ok: true } : { ok: false, error: "That token wasn't found." };
}
