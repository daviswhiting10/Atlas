import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { updateAssignedWorkout } from "@/lib/db/programs";
import { UpdateAssignedWorkoutSchema } from "@/lib/validations/program";

export const PATCH = withWorkspace<{ assignmentId: string; workoutId: string }>(
  async (req, { workspaceId }, { params }) => {
    const { workoutId } = await params;
    const body = await req.json();
    const parsed = UpdateAssignedWorkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    try {
      const updated = await updateAssignedWorkout(workoutId, workspaceId, parsed.data);
      return NextResponse.json(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg === "Not found") return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (msg.includes("CLIENT mode")) return NextResponse.json({ error: msg }, { status: 422 });
      throw err;
    }
  }
);
