"use client";

import { useEffect, useRef, useState } from "react";
import { useAutoGrow } from "@/hooks/use-auto-grow";
import { NOTE_FOCUS_MAX, NOTE_FOCUS_MIN } from "@/lib/set-note";
import { cn } from "@/lib/utils";

/**
 * A set's note. At rest it is one line, as before. Touch it and it opens to at least three lines and grows as you type
 * (up to eight, then it scrolls); touch anywhere outside and it closes back to one line. Closing is done here, not left to
 * the browser, because iOS Safari does not always blur a text box when the tap lands on empty space.
 */
export function SetNote({
  value,
  onChange,
  onBlur,
  label,
  className,
  placeholder = "Set note…",
  fontSize,
}: {
  value: string;
  onChange: (text: string) => void;
  onBlur?: () => void;
  label: string;
  className?: string;
  placeholder?: string;
  fontSize?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  useAutoGrow(box, value, open ? NOTE_FOCUS_MIN : 1, open ? NOTE_FOCUS_MAX : 1);

  // While it is open, a touch anywhere else closes it (and saves, through onBlur).
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) box.current.blur();
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);

  return (
    <textarea
      ref={box}
      value={value}
      rows={1}
      maxLength={500}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setOpen(true)}
      onBlur={() => {
        setOpen(false);
        onBlur?.();
      }}
      // Closed: one line, the rest of the text kept but out of sight (no scrollbar, no wrapping into view).
      className={cn("block w-full resize-none leading-snug", open ? "" : "overflow-hidden whitespace-nowrap", className)}
      style={fontSize ? { fontSize } : undefined}
    />
  );
}
