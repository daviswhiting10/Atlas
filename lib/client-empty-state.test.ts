import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCEPT } from "@/components/plan/plan-file";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const page = read("app/(dashboard)/clients/[id]/ClientDetail.tsx");

describe("a client with no plan and no sessions: the page leads with Create a plan", () => {
  it("the lead is only for no plan AND no sessions", () => {
    expect(page).toContain("const noPlanNoSessions = client.programAssignments.length === 0 && client.workoutLogs.length === 0;");
  });
  it("leads with 'Create a plan' and the shared importer (drop zone), with Log session as a quiet link under it", () => {
    const lead = page.slice(page.indexOf("{noPlanNoSessions ? ("), page.indexOf(") : (", page.indexOf("{noPlanNoSessions ? (")));
    expect(lead).toContain("Create a plan");
    expect(lead.indexOf("<SheetPlanUpload")).toBeGreaterThan(lead.indexOf("Create a plan"));
    expect(lead.indexOf("Log session")).toBeGreaterThan(lead.indexOf("<SheetPlanUpload"));
    expect(lead).not.toContain("h-14"); // no longer the big primary button
  });
  it("once there is a plan or a session, Log session is the primary button, as before", () => {
    const rest = page.slice(page.indexOf(") : (", page.indexOf("{noPlanNoSessions ? (")));
    expect(rest.slice(0, 400)).toContain("h-14 w-full");
    expect(rest.slice(0, 400)).toContain("Log session");
  });
  it("the drop zone takes .xlsx, .csv, .pdf and screenshots", () => {
    for (const t of [".xlsx", ".csv", ".pdf", "application/pdf", "image/png", "image/jpeg"]) expect(ACCEPT).toContain(t);
  });
  it("the importer uses the shared drop zone", () => {
    expect(read("components/coach/SheetPlanUpload.tsx")).toContain("<PlanDropZone");
  });
});
