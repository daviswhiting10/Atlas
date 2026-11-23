"use client";

import { DOOR_ROWS, DoorRows } from "@/components/plan/DoorRows";
import { SheetPlanUpload } from "@/components/coach/SheetPlanUpload";
import { AssignFromLibrary } from "@/components/coach/AssignFromLibrary";
import { CoachPlanForm } from "@/components/coach/CoachPlanForm";
import type { Door } from "@/lib/plan-start";

/** The coach words the rows for a client. */
const COACH_ROWS = DOOR_ROWS.map((r) => ({ ...r, meta: r.door === "import" ? "Spreadsheet, photos or a Sheets link" : r.door === "own" ? "From a program" : "From their goal" }));

/**
 * The Plan tab's way in: three rows. Opening one opens it in place and closes the others; each shows only what it needs.
 * Everything inside is the same as before (the importer, the library, the Atlas form), only folded behind its row.
 */
export function PlanStart({ client, initialDoor = null }: { client: { id: string; fullName: string; primaryGoal: string | null }; initialDoor?: Door | null }) {
  const firstName = client.fullName.split(" ")[0];
  return (
    <DoorRows
      initialDoor={initialDoor}
      rows={COACH_ROWS}
      panel={(door) => (
        <>
          {door === "import" && <SheetPlanUpload clientId={client.id} firstName={firstName} />}
          {door === "own" && <AssignFromLibrary clientId={client.id} firstName={firstName} />}
          {door === "atlas" && <CoachPlanForm clients={[client]} fixedClientId={client.id} door />}
        </>
      )}
    />
  );
}
