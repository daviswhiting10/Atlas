"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { removeExerciseMedia, saveExerciseMedia } from "@/lib/actions/exercise-media";
import type { Picture } from "@/lib/exercises/pictures";

// Mirrors lib/exercises/media.ts LIMITS (the server checks again).
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 15;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

/** A phone photo, scaled to 1280px on the long side as a JPEG: a few hundred KB. */
async function shrinkPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new Error("Couldn't read that photo.");
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** A video's length, read in the browser before anything is uploaded. */
function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that video."));
    };
    v.src = url;
  });
}

/**
 * Upload the coach's own photo or short clip for an exercise, or take it off.
 * It replaces the library picture for this coach and their clients.
 */
export function ExerciseMediaUpload({ workspaceId, exerciseId, picture }: { workspaceId: string; exerciseId: string; picture: Picture | null | undefined }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function send(original: File) {
    try {
      const video = VIDEO_TYPES.includes(original.type);
      if (!video && !original.type.startsWith("image/")) throw new Error("Choose a photo or a video.");
      let file = original;
      if (video) {
        const secs = await videoSeconds(original);
        if (secs > MAX_VIDEO_SECONDS + 0.5) throw new Error(`Keep clips to ${MAX_VIDEO_SECONDS} seconds (that one is ${Math.round(secs)}).`);
        if (original.size > MAX_VIDEO_BYTES) throw new Error("That clip is too big. Record at 720p, or trim it.");
      } else {
        setBusy("Preparing…");
        file = await shrinkPhoto(original);
        if (file.size > MAX_IMAGE_BYTES) throw new Error("That photo is too big.");
      }

      setBusy("Uploading…");
      const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-40);
      const blob = await upload(`exercise-media/${workspaceId}/${exerciseId}-${safe}`, file, {
        access: "public",
        handleUploadUrl: "/api/exercise-media/upload",
        clientPayload: JSON.stringify({ exerciseId, kind: video ? "video" : "image" }),
        contentType: file.type,
        onUploadProgress: ({ percentage }) => setBusy(`Uploading… ${Math.round(percentage)}%`),
      });

      setBusy("Saving…");
      const res = await saveExerciseMedia({ exerciseId, url: blob.url });
      if (!res.ok) throw new Error(res.error);
      toast.success(video ? "Clip added" : "Photo added");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("Removing…");
    const res = await removeExerciseMedia({ exerciseId });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Back to the library picture");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={!!busy}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:border-ink/40 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {busy ?? (picture?.own ? "Replace photo or clip" : "Upload photo or clip")}
      </button>
      {picture?.own && !busy && (
        <button type="button" onClick={remove} className="text-xs font-medium text-muted-foreground hover:text-foreground">
          Remove mine
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) send(f);
        }}
      />
      <p className="w-full text-[11px] text-muted-foreground">Photo, or a clip up to 15 seconds. Shown to your clients instead of the library picture.</p>
    </div>
  );
}
