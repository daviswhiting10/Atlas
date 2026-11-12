import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { IMAGE_TYPES, LIMITS, VIDEO_TYPES, blobConfigured, folderFor } from "@/lib/exercises/media";

/**
 * Hands the browser a short-lived token to upload one exercise photo or clip
 * straight to Blob, within the size and type limits. The file is recorded
 * afterwards by saveExerciseMedia, which checks it again (rather than an
 * upload-completed callback, which can't reach a local dev server).
 */
export async function POST(request: Request) {
  if (!blobConfigured()) return NextResponse.json({ error: "Uploads aren't set up yet." }, { status: 503 });
  const session = await auth();
  const workspaceId = session?.user?.workspaceId;
  if (!session?.user?.id || !workspaceId || session.user.role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { exerciseId, kind } = JSON.parse(clientPayload ?? "{}") as { exerciseId?: string; kind?: string };
        if (!pathname.startsWith(folderFor(workspaceId))) throw new Error("Wrong folder.");
        const ex = exerciseId ? await prisma.exercise.findFirst({ where: { id: exerciseId, OR: [{ workspaceId: null }, { workspaceId }] }, select: { id: true } }) : null;
        if (!ex) throw new Error("That exercise couldn't be found.");
        const video = kind === "video";
        return {
          allowedContentTypes: video ? VIDEO_TYPES : IMAGE_TYPES,
          maximumSizeInBytes: video ? LIMITS.videoBytes : LIMITS.imageBytes,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload refused." }, { status: 400 });
  }
}
