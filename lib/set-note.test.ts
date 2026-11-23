import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTE_FOCUS_MAX, NOTE_FOCUS_MIN } from "./set-note";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const note = read("components/logger/SetNote.tsx");
const logger = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");

describe("the set note", () => {
  it("opens to at least three lines and grows up to eight", () => {
    expect(NOTE_FOCUS_MIN).toBe(3);
    expect(NOTE_FOCUS_MAX).toBeGreaterThan(NOTE_FOCUS_MIN);
    expect(note).toContain("useAutoGrow(box, value, open ? NOTE_FOCUS_MIN : 1, open ? NOTE_FOCUS_MAX : 1)");
  });
  it("is one line when it is not being written", () => {
    expect(note).toContain("rows={1}");
    expect(note).toContain("overflow-hidden whitespace-nowrap");
  });
  it("closes on a touch anywhere outside it, itself (iOS does not always blur on a tap in empty space)", () => {
    expect(note).toContain('document.addEventListener("pointerdown", away, true)');
    expect(note).toContain("box.current.blur()");
    expect(note).toContain('document.removeEventListener("pointerdown", away, true)');
  });
  it("still saves when it closes (the logger's onBlur runs)", () => {
    expect(note).toContain("onBlur?.()");
  });
  it("on a phone it takes the whole row while it is being written", () => {
    expect(logger).toContain("focus:basis-full");
    expect(logger).toContain('className="flex flex-wrap items-start gap-1.5"');
  });
  it("both set note fields in the logger use it, with the same labels as before", () => {
    expect(logger).toContain("<SetNote");
    expect(logger.match(/<SetNote/g)?.length).toBe(2);
    expect(logger).toContain("label={`Set ${idx + 1} note`}");
    expect(logger).not.toContain('placeholder="Set note…"');
  });
});
