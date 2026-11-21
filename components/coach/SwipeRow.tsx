"use client";

import { useRef, useState } from "react";

const REVEAL = 88; // px: the Delete button's width

/**
 * A roster row that swipes left to reveal Delete. A short or vertical drag is a scroll or a tap; past halfway it
 * stays open. Tapping the row while it's open closes it instead of opening the client.
 */
export function SwipeRow({ open, onOpenChange, onDelete, children }: { open: boolean; onOpenChange: (open: boolean) => void; onDelete: () => void; children: React.ReactNode }) {
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const horizontal = useRef(false);
  const [dx, setDx] = useState<number | null>(null);
  const offset = dx ?? (open ? -REVEAL : 0);

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        onClick={onDelete}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-sm font-semibold text-white"
        style={{ width: REVEAL }}
      >
        Delete
      </button>
      <div
        className="relative bg-paper"
        style={{ transform: `translateX(${offset}px)`, transition: dx == null ? "transform 180ms ease-out" : "none", touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, base: open ? -REVEAL : 0 };
          horizontal.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!horizontal.current) {
            if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) return void (start.current = null); // a scroll
            if (Math.abs(mx) < 8) return;
            horizontal.current = true;
          }
          setDx(Math.min(0, Math.max(-REVEAL - 24, s.base + mx)));
        }}
        onPointerUp={() => {
          if (horizontal.current && dx != null) onOpenChange(dx < -REVEAL / 2);
          start.current = null;
          setDx(null);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(null);
        }}
        onClickCapture={(e) => {
          // A swipe isn't a tap, and a tap on an open row just closes it.
          if (horizontal.current || open) {
            e.preventDefault();
            e.stopPropagation();
            horizontal.current = false;
            if (open) onOpenChange(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
