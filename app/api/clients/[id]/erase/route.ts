import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { clientDeletePreview, deleteClientCompletely } from "@/lib/clients/delete-client";

/**
 * Delete a client for good (the roster's swipe-to-delete). GET says exactly what would go (the confirm sheet);
 * POST deletes it. Coaches only, only their own clients; never their own training, never in the demo.
 */
export const GET = withWorkspace<{ id: string }>(async (_req, { workspaceId, userId }, { params }) => {
  const { id } = await params;
  const preview = await clientDeletePreview(id, workspaceId, userId);
  return preview.ok ? NextResponse.json(preview) : NextResponse.json({ error: preview.error }, { status: preview.status });
});

export const POST = withWorkspace<{ id: string }>(async (_req, { workspaceId, userId }, { params }) => {
  const { id } = await params;
  const result = await deleteClientCompletely(id, workspaceId, userId);
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: result.status });
});
