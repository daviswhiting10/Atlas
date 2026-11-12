"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Picture } from "@/lib/exercises/pictures";

/** Start and end of the movement, alternating, so two photos read as a short clip. */
function useFrame(frames: string[], running: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!running || frames.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % frames.length), 900);
    return () => clearInterval(id);
  }, [frames.length, running]);
  return frames[i] ?? frames[0];
}

function Frames({ picture, running, className }: { picture: Picture; running: boolean; className?: string }) {
  const src = useFrame(picture.frames, running);
  if (picture.video) {
    return (
      <div className={cn("relative overflow-hidden bg-ink/5", className)}>
        <video src={picture.video} autoPlay muted loop playsInline preload="auto" aria-label={picture.name} className="absolute inset-0 h-full w-full object-contain" />
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden bg-ink/5", className)}>
      {/* Both frames load up front, so switching never flashes. */}
      {picture.frames.map((f) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={f} src={f} alt={f === src ? picture.name : ""} loading="lazy" className={cn("absolute inset-0 h-full w-full object-contain", f === src ? "opacity-100" : "opacity-0")} />
      ))}
    </div>
  );
}

/** Full-screen view: the movement, large, with the library's name for it. */
function Viewer({ picture, name, onClose }: { picture: Picture; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={name} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 fade-in" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="min-w-0 truncate font-semibold text-ink">{name}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-mute hover:bg-ink/5 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <Frames picture={picture} running className="aspect-[4/3] w-full" />
      </div>
    </div>
  );
}

/** A small picture beside an exercise's name. Tap for the large view. Nothing when there's no picture. */
export function ExerciseThumb({ picture, name, className }: { picture: Picture | null | undefined; name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!picture) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`See ${name}`}
        className={cn("press relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-white", className)}
      >
        {picture.video ? (
          // The clip's first frame; it plays in the large view.
          <video src={`${picture.video}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture.frames[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </button>
      {open && <Viewer picture={picture} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A larger, moving picture, for the one exercise on screen. Tap for full size. */
export function ExercisePicture({ picture, name, className }: { picture: Picture | null | undefined; name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!picture) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`See ${name} larger`} className={cn("press block w-full overflow-hidden rounded-2xl border border-line", className)}>
        <Frames picture={picture} running className="aspect-[4/3] w-full" />
      </button>
      {open && <Viewer picture={picture} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
