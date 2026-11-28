import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/db/client", async () => ({ prisma: (await import("@/lib/auth/test-db")).fakePrisma }));

import { resetDb } from "@/lib/auth/test-db";
import type { AuditEntry } from "./audit";
import type { McpCaller, ScopedClient } from "./context";
import { clientTool, executeTool, type ToolDeps } from "./tool";
import { allowMcpWrite } from "./write-limit";

const t0 = new Date("2026-11-27T10:00:00Z");
const client: ScopedClient = { id: "c1", workspaceId: "ws1", fullName: "Sam", primaryGoal: null, keyLiftIds: [], selfServe: true };
const athlete: McpCaller = { userId: "u1", role: "CLIENT", workspaceId: "ws1", clientProfileId: "c1" };

describe("MCP write limit (300 an hour per user)", () => {
  beforeEach(resetDb);

  it("allows 300 and refuses the 301st", async () => {
    for (let i = 0; i < 300; i++) expect(await allowMcpWrite("u1", t0), `write ${i + 1}`).toBe(true);
    expect(await allowMcpWrite("u1", t0)).toBe(false);
    // Another user has their own count.
    expect(await allowMcpWrite("u2", t0)).toBe(true);
    // A new hour starts again.
    expect(await allowMcpWrite("u1", new Date(t0.getTime() + 60 * 60_000))).toBe(true);
  });

  it("in the pipeline: the 301st write is refused before its handler runs; reads still pass", async () => {
    const rows: AuditEntry[] = [];
    const handler = vi.fn(async () => ({ ok: true }));
    const deps: ToolDeps = { transport: "http", audit: async (e) => void rows.push(e), lookupClient: async () => client, allowWrite: (id) => allowMcpWrite(id, t0) };
    const base = { title: "", description: "", roles: ["CLIENT"] as const, input: z.object({ clientId: z.string().optional() }), handler };
    const write = clientTool({ ...base, name: "write_thing", permission: "write" });
    const read = clientTool({ ...base, name: "read_thing", permission: "read" });

    for (let i = 0; i < 300; i++) expect((await executeTool(write, athlete, {}, deps)).outcome).toBe("ok");
    const refused = await executeTool(write, athlete, {}, deps);
    expect(refused).toEqual({ outcome: "rate_limited", message: expect.stringContaining("Nothing was written") });
    expect(handler).toHaveBeenCalledTimes(300);
    expect(rows.at(-1)).toMatchObject({ tool: "write_thing", outcome: "rate_limited" });

    for (let i = 0; i < 5; i++) expect((await executeTool(read, athlete, {}, deps)).outcome).toBe("ok");
    expect(handler).toHaveBeenCalledTimes(305);
  });
});
