import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import type { ImageInput } from "@/lib/ai/client";
import { ReadError, readProgramFromImages } from "@/lib/programs/read-images";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

// ─── Route ───────────────────────────────────────────────────────────────────

export const POST = withWorkspace(async (req, { workspaceId, userId }) => {
  const formData = await req.formData();
  const notes = (formData.get("notes") as string | null) ?? undefined;

  // Collect images — sent as image0, image1, image2 … from the client
  const images: ImageInput[] = [];
  let idx = 0;
  while (true) {
    const file = formData.get(`image${idx}`) as File | null;
    if (!file) break;
    if (!ALLOWED_TYPES.includes(file.type as AllowedType)) {
      return NextResponse.json(
        { error: `image${idx}: must be PNG, JPEG, GIF, or WebP` },
        { status: 400 }
      );
    }
    const buf = await file.arrayBuffer();
    images.push({
      base64: Buffer.from(buf).toString("base64"),
      mediaType: file.type as AllowedType,
    });
    idx++;
  }

  if (images.length === 0) {
    return NextResponse.json({ error: "At least one image is required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await readProgramFromImages({ images, notes, workspaceId, userId }));
  } catch (err) {
    if (err instanceof ReadError) return NextResponse.json({ error: err.message, ...(err.raw ? { raw: err.raw } : {}) }, { status: err.status });
    throw err;
  }
});
