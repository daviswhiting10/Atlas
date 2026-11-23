/**
 * How tall a text box should be for what is in it: at least `minRows` lines, growing as the text does up to `maxRows`
 * lines, then it scrolls. Pure: the browser measures, this decides. All numbers are CSS pixels, for a box-sizing:
 * border-box textarea (so the borders are part of its height; `scrollHeight` already includes the padding).
 */
export function fitHeight({ scrollHeight, line, padY, borderY, minRows, maxRows }: { scrollHeight: number; line: number; padY: number; borderY: number; minRows: number; maxRows: number }): { height: number; scroll: boolean } {
  const min = Math.round(minRows * line + padY + borderY);
  const max = Math.round(maxRows * line + padY + borderY);
  const want = Math.ceil(scrollHeight + borderY);
  return { height: Math.min(Math.max(want, min), max), scroll: want > max };
}
