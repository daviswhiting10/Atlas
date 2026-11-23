import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const coach = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
const athlete = read("components/athlete/WorkoutLogger.tsx");
const block = coach.slice(coach.indexOf("Session complete"), coach.indexOf("MOBILE LAYOUT"));

describe("Session complete (coach)", () => {
  it("unsaved typed text is what makes Save notes the main button", () => {
    expect(coach).toContain("const notesUnsaved = rawInput.trim() !== savedNotes.trim();");
    expect(block).toMatch(/notesUnsaved \? \(\s*<Button className="mt-3 w-full" disabled=\{savingNotes\} onClick=\{saveNotes\}>/);
  });
  it("with nothing unsaved (notes saved, or skipped entirely) the main button is a solid 'Done — back to <client>'", () => {
    expect(block).toContain("Done — back to {clientName}");
    const done = block.slice(block.indexOf("Done — back to {clientName}") - 260, block.indexOf("Done — back to {clientName}"));
    expect(done).not.toContain('variant="outline"');
    expect(done).toContain("router.push(`/clients/${clientId}`)");
  });
  it("while notes are unsaved, going back is the quiet outline button, as before", () => {
    expect(block).toMatch(/variant="outline" onClick=\{\(\) => router\.push\(`\/clients\/\$\{clientId\}`\)\}>\s*Back to \{clientName\}/);
  });
  it("after saving it says so and keeps the page", () => {
    expect(block).toContain("Notes saved");
    // The only ways out are the two back buttons (the quiet one, and Done).
    expect(block.match(/router\.push/g)?.length).toBe(2);
  });
});

describe("the finish screen on the athlete side", () => {
  it("the main button is 'Done — back to your plan' and goes home (Today), solid as before", () => {
    const at = athlete.indexOf("Done — back to your plan");
    expect(at).toBeGreaterThan(0);
    const link = athlete.slice(at - 330, at);
    expect(link).toContain("href={`${base}/today`}");
    expect(link).toContain("bg-dusk-button");
  });
});
