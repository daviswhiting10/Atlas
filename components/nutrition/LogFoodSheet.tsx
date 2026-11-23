"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Barcode, Camera } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { logFood, lookupBarcode, type BarcodeProduct } from "@/lib/actions/nutrition";
import { parseBarcode, scaleOff } from "@/lib/nutrition/calc";

/** A photo made small enough to keep as a note: at most 800 px on the long side, JPEG. Nothing is read from it. */
async function shrink(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("unreadable"));
      i.src = url;
    });
    for (const max of [800, 600, 440]) {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", 0.7);
      if (data.length <= 280_000) return data;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Mode = "menu" | "photo" | "text" | "barcode";
const field = "h-12 w-full rounded-xl border border-line-strong bg-paper px-3.5 text-[16px] text-ink placeholder:text-ink-mute";
const primary = "press flex h-12 w-full items-center justify-center rounded-xl bg-dusk-button text-[16px] font-semibold text-dusk-button-text disabled:opacity-60";

/**
 * Log food: a bottom sheet with three ways in, in this order: a photo (kept as a note on the entry; no calories are
 * read from it), a few words (any calories are typed by the person), a barcode (Open Food Facts supplies the numbers).
 */
export function LogFoodSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("menu");
  const [pending, start] = useTransition();
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [code, setCode] = useState("");
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [grams, setGrams] = useState("100");
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const reset = () => {
    setMode("menu"); setPhoto(null); setNote(""); setName(""); setKcal(""); setProtein(""); setCode(""); setProduct(null); setGrams("100"); setScanning(false);
  };
  const close = () => {
    if (pending) return;
    reset();
    onClose();
  };
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const bad = (s: string) => s.trim() !== "" && !(Number.isFinite(Number(s)) && Number(s) >= 0);

  const done = (r: { ok: boolean; error?: string }): void => {
    if (!r.ok) {
      toast.error(r.error ?? "Couldn't save that.");
      return;
    }
    toast.success("Logged");
    close();
  };

  const find = (c: string) =>
    start(async () => {
      const r = await lookupBarcode({ barcode: c }).catch(() => ({ ok: false as const, error: "Couldn't look that up." }));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setProduct(r.product);
      setGrams(String(Math.round(r.product.servingG ?? 100)));
    });

  // Scanning with the camera where the browser can (BarcodeDetector); typing the number always works.
  const canScan = typeof window !== "undefined" && "BarcodeDetector" in window;
  useEffect(() => {
    if (!scanning) return;
    let stop = false;
    let stream: MediaStream | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const det = new (window as any).BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        while (!stop && video.current) {
          const hits = await det.detect(video.current).catch(() => []);
          const v = hits[0]?.rawValue as string | undefined;
          if (v && parseBarcode(v)) { setCode(v); setScanning(false); find(v); return; }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        toast.error("Couldn't open the camera. Type the number instead.");
        setScanning(false);
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const g = Number(grams);
  const preview = product && Number.isFinite(g) && g > 0 ? scaleOff(product.per100, g) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        showCloseButton={false}
        className="!top-auto !bottom-0 !left-0 !max-h-[92vh] !max-w-none !translate-x-0 !translate-y-0 !overflow-y-auto !rounded-b-none px-4 pt-4 sm:!bottom-auto sm:!left-1/2 sm:!top-1/2 sm:!max-w-sm sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!rounded-b-[18px]"
        style={{ backgroundColor: "var(--popover)", color: "var(--popover-foreground)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="font-body text-[22px] font-semibold tracking-[-0.02em]">{mode === "menu" ? "Log food" : mode === "photo" ? "Photo" : mode === "text" ? "Describe it" : "Barcode"}</DialogTitle>
          <button type="button" onClick={mode === "menu" ? close : () => { setScanning(false); setMode("menu"); }} className="press -mr-2 flex h-11 items-center px-3 text-[15px] font-medium text-ink-soft">
            {mode === "menu" ? "Close" : "Back"}
          </button>
        </div>
        <DialogDescription className="sr-only">Log food by photo, by a few words, or by barcode.</DialogDescription>

        {mode === "menu" && (
          <div className="space-y-3">
            <label className="press flex h-[132px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[20px] bg-dusk-button text-dusk-button-text">
              <Camera className="h-8 w-8" />
              <span className="text-[18px] font-semibold">Take a photo</span>
              <span className="px-4 text-center text-[13px] opacity-75">Saved as a note on the entry. Atlas doesn&apos;t read calories from it yet.</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const data = await shrink(f);
                  if (!data) return toast.error("Couldn't use that photo. Try another.");
                  setPhoto(data);
                  setMode("photo");
                }}
              />
            </label>
            <input aria-label="Describe it" placeholder="Or describe it: 2 eggs, toast, black coffee" className={field} value={name} onChange={(e) => setName(e.target.value)} onFocus={() => setMode("text")} />
            <button type="button" onClick={() => setMode("barcode")} className="press flex h-14 w-full items-center gap-3 rounded-2xl border border-line-strong px-4 text-[16px] font-semibold">
              <Barcode className="h-5 w-5" /> Scan a barcode
            </button>
          </div>
        )}

        {mode === "photo" && photo && (
          <div className="mt-3 space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="Your photo" className="max-h-56 w-full rounded-xl object-cover" />
            <input aria-label="What is it" placeholder="What is it? (optional)" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <input aria-label="Note" placeholder="Note (optional)" className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <p className="text-[13px] text-ink-mute">No calories are added from a photo. Add them by describing it if you want it counted.</p>
            <button type="button" disabled={pending} className={primary} onClick={() => start(async () => done(await logFood({ source: "PHOTO", photo, name: name || null, note: note || null }).catch(() => ({ ok: false, error: "Couldn't save that." }))))}>
              Save
            </button>
          </div>
        )}

        {mode === "text" && (
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || bad(kcal) || bad(protein)) return toast.error("Check the name and numbers.");
              start(async () => done(await logFood({ source: "TEXT", name, calories: num(kcal), proteinG: num(protein) }).catch(() => ({ ok: false, error: "Couldn't save that." }))));
            }}
          >
            <input autoFocus aria-label="What you ate" placeholder="2 eggs, toast, black coffee" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <div className="flex gap-2">
              <input aria-label="Calories (optional)" inputMode="decimal" placeholder="kcal (optional)" className={field} value={kcal} onChange={(e) => setKcal(e.target.value)} />
              <input aria-label="Protein grams (optional)" inputMode="decimal" placeholder="protein g (optional)" className={field} value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
            <p className="text-[13px] text-ink-mute">Calories and protein count only if you type them. Left empty, the entry is kept without numbers.</p>
            <button type="submit" disabled={pending} className={primary}>Save</button>
          </form>
        )}

        {mode === "barcode" && (
          <div className="mt-3 space-y-3">
            {!product ? (
              <>
                {scanning && <video ref={video} playsInline muted className="h-52 w-full rounded-xl bg-black object-cover" />}
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const c = parseBarcode(code); if (!c) return toast.error("A barcode is 8 to 14 digits."); find(c); }}>
                  <input autoFocus aria-label="Barcode number" inputMode="numeric" placeholder="Barcode number" className={field} value={code} onChange={(e) => setCode(e.target.value)} />
                  <button type="submit" disabled={pending} className="press h-12 shrink-0 rounded-xl bg-dusk-button px-4 text-[15px] font-semibold text-dusk-button-text disabled:opacity-60">Look up</button>
                </form>
                {canScan && !scanning && (
                  <button type="button" onClick={() => setScanning(true)} className="press flex h-12 w-full items-center justify-center rounded-xl border border-line-strong text-[15px] font-semibold">
                    Scan with the camera
                  </button>
                )}
                <p className="text-[13px] text-ink-mute">Numbers come from Open Food Facts, a free open database. Only the barcode is sent.</p>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[17px] font-semibold">{product.name}</p>
                  {product.brand && <p className="text-[14px] text-ink-mute">{product.brand}</p>}
                </div>
                <label className="block text-[13px] text-ink-mute">
                  Amount eaten, grams
                  <input aria-label="Grams" inputMode="decimal" className={field + " mt-1"} value={grams} onChange={(e) => setGrams(e.target.value)} />
                </label>
                <p className="text-[15px] text-ink-soft">
                  {preview?.calories != null ? `${Math.round(preview.calories)} kcal` : "No calories listed for this product"}
                  {preview?.proteinG != null ? ` · ${Math.round(preview.proteinG)} g protein` : ""}
                </p>
                <button type="button" disabled={pending || !(g > 0)} className={primary} onClick={() => start(async () => done(await logFood({ source: "BARCODE", barcode: product.barcode, grams: g }).catch(() => ({ ok: false, error: "Couldn't save that." }))))}>
                  Save
                </button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
