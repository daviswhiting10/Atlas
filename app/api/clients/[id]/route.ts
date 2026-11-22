import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { getClient, updateClient } from "@/lib/db/clients";
import { changeClientEmail } from "@/lib/clients/change-email";

const UpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  primaryGoal: z.string().optional(),
  status: z.enum(["PROSPECT", "ACTIVE", "AT_RISK", "CHURNED"]).optional(),
  reachOutDate: z.string().datetime().optional().nullable(),
});

export const GET = withWorkspace<{ id: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { id } = await params;
    const client = await getClient(id, workspaceId);
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(client);
  }
);

export const PATCH = withWorkspace<{ id: string }>(
  async (req, { workspaceId }, { params }) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { reachOutDate, email, ...rest } = parsed.data;
    // The email goes through its own path: if she has a login, it changes too (or the change is refused).
    if (email !== undefined) {
      const changed = await changeClientEmail(id, workspaceId, email);
      if (!changed.ok) return NextResponse.json({ error: changed.error }, { status: changed.status });
    }
    const updateData: Parameters<typeof updateClient>[2] = { ...rest };
    if (reachOutDate !== undefined) {
      updateData.reachOutDate = reachOutDate === null ? null : new Date(reachOutDate);
    }
    await updateClient(id, workspaceId, updateData);
    const updated = await getClient(id, workspaceId);
    return NextResponse.json(updated);
  }
);

// Deleting a client: POST /api/clients/[id]/erase (deletes her for good, with a confirm sheet first). The old
// hide-only DELETE here is gone.
