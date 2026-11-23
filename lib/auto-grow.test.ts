import { describe, expect, it } from "vitest";
import { fitHeight } from "./auto-grow";

// A 15 px font on a 24 px line, 8 px of padding above and below, a 1 px border: one line is 24, plus 16, plus 2.
const base = { line: 24, padY: 16, borderY: 2, minRows: 4, maxRows: 12 };
const h = (rows: number) => rows * 24 + 16 + 2;

describe("fitHeight", () => {
  it("is at least minRows lines tall, even when empty", () => {
    expect(fitHeight({ ...base, scrollHeight: 24 + 16 })).toEqual({ height: h(4), scroll: false });
  });
  it("grows with the text", () => {
    expect(fitHeight({ ...base, scrollHeight: 7 * 24 + 16 })).toEqual({ height: h(7), scroll: false });
  });
  it("stops at maxRows and scrolls beyond it", () => {
    expect(fitHeight({ ...base, scrollHeight: 12 * 24 + 16 })).toEqual({ height: h(12), scroll: false });
    expect(fitHeight({ ...base, scrollHeight: 20 * 24 + 16 })).toEqual({ height: h(12), scroll: true });
  });
  it("counts the border (the box is border-box, scrollHeight is not)", () => {
    expect(fitHeight({ ...base, scrollHeight: 5 * 24 + 16, borderY: 4 }).height).toBe(5 * 24 + 16 + 4);
  });
  it("a collapsed single line can be asked for too", () => {
    expect(fitHeight({ ...base, minRows: 1, maxRows: 1, scrollHeight: 3 * 24 + 16 })).toEqual({ height: h(1), scroll: true });
  });
});
