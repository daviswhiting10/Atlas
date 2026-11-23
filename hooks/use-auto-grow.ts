import { useLayoutEffect, type RefObject } from "react";
import { fitHeight } from "@/lib/auto-grow";

/** Sizes a textarea to its content (lib/auto-grow), again when the text or the box's width changes. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement>, value: string, minRows: number, maxRows: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize) || 16;
      const line = parseFloat(cs.lineHeight) || size * 1.4;
      el.style.height = "auto";
      const r = fitHeight({
        scrollHeight: el.scrollHeight,
        line,
        padY: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
        borderY: parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth),
        minRows,
        maxRows,
      });
      el.style.height = `${r.height}px`;
      el.style.overflowY = r.scroll ? "auto" : "hidden";
    };
    fit();
    // A different width wraps the text differently.
    let width = el.clientWidth;
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ref, value, minRows, maxRows]);
}
