import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { inviteClient } from "@/lib/clients/invite";

/** The Invite button. The flow itself (login, one-time link, email) is lib/clients/invite.ts, shared with "Assign and invite". */
export const POST = withWorkspace<{ id: string }>(async (_req, { workspaceId }, { params }) => {
  const { id: clientId } = await params;
  const result = await inviteClient(clientId, workspaceId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
});
