/**
 * A new plan from an outline an AI wrote: training days, each with exercises and sets x reps, repeated for N weeks.
 * Saved through the sheet importer's own writer (lib/programs/save-sheet-plan), so the plan design rules apply as they
 * do to an imported file: a lone number is widened down into a range, a written range is kept, and a strength day with
 * no core work is flagged with one suggestion (added only when asked).
 *
 * What happens to the plan that's live now is what the app does:
 *  - a coach's plan for a client is a DRAFT next to the live one (as the coach's file import); the live plan is untouched
 *    until the coach assigns the draft in Atlas, which completes the old plan and keeps its history.
 *  - a self-serve athlete's own plan is live at once (as the athlete's file import); the plan that was live is marked
 *    COMPLETED. Its sessions and sets stay as they are.
 * Nothing logged is ever deleted or changed.
 */

import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { GUEST_EMAIL_DOMAIN } from "@/lib/auth/route-policy";
import { canImportPlan } from "@/lib/athlete/empty-state";
import { saveSheetPlan } from "@/lib/programs/save-sheet-plan";
import { resolveForClient } from "@/lib/programs/resolve-exercise";
import { addSuggestion, coreGaps, rangeAddedLines } from "@/lib/programs/plan-rules";
import { parseSetsReps, type SheetGrid } from "@/lib/programs/sheet-plan";
import { ALL_ROLES } from "../auth";
import { forbidden, invalid } from "../context";
import { ClientIdArg, IsoDate, TimeZoneArg } from "../schemas";
import { zoneFor } from "../data";
import { localDay } from "@/lib/athlete/sessions";
import { clientTool } from "../tool";

const OutlineExercise = z.object({
  exercise: z.string().trim().min(2).max(80).describe("Exercise name, e.g. 'Back Squat', 'DB Bench Press'. Matched to what this person already logs first (so the plan continues their history), then the workspace's exercises, then the library; a name nothing knows becomes the workspace's own exercise. The result says what each name matched."),
  prescription: z.string().trim().min(1).max(40).describe("Sets x reps as a coach writes it: '3x8-10', '5x5', '3x30 sec', '1x20 min'. A lone number of 6 or more reps becomes a range (3x10 → 3x8-10)."),
  notes: z.string().max(300).optional(),
  group: z.string().trim().max(12).optional().describe("Exercises next to each other with the same group (e.g. 'A') are a superset: done back to back, then rest."),
});
const OutlineDay = z.object({
  name: z.string().trim().min(1).max(60).describe("e.g. 'Upper A', 'Day 1: Lower'."),
  exercises: z.array(OutlineExercise).min(1).max(20),
});

export const createPlanFromOutline = clientTool({
  name: "create_plan_from_outline",
  title: "Create plan from outline",
  description:
    "Write a new plan from an outline: training days, each with exercises and sets x reps, repeated for `weeks` weeks. As a coach writing for a client: saved as a DRAFT next to the client's live plan; the coach checks it and assigns it in Atlas. For your own training (a self-serve athlete, or a coach's own profile): it becomes the live plan now and the previous plan is marked completed. Logged sessions are never changed or deleted. A strength day with no core work is flagged with a suggestion; pass addSuggestedCore to add it.",
  permission: "write",
  roles: ALL_ROLES,
  input: z.object({
    clientId: ClientIdArg,
    name: z.string().trim().min(1).max(120).describe("The plan's name."),
    weeks: z.number().int().min(1).max(16).default(4).describe("How many weeks the days repeat for."),
    startDate: IsoDate.optional().describe("Week 1's first day (YYYY-MM-DD), a calendar day. Defaults to today in `timezone`."),
    timezone: TimeZoneArg,
    goals: z.array(z.string().trim().max(40)).max(5).default([]),
    days: z.array(OutlineDay).min(1).max(7).describe("One entry per training day of the week, in order."),
    addSuggestedCore: z.boolean().default(false).describe("Add the suggested core exercise to each strength day that has none."),
  }),
  async handler({ client, caller }, args) {
    // An athlete builds their own plan only where the app lets them (self-serve, not a guest): a coached client's plan comes from their coach.
    if (caller.role === "CLIENT") {
      const user = await prisma.user.findUnique({ where: { id: caller.userId }, select: { email: true } });
      const isGuest = (user?.email ?? "").endsWith(`@${GUEST_EMAIL_DOMAIN}`);
      if (!canImportPlan({ selfServe: client.selfServe, isCoach: false, isGuest })) {
        throw forbidden(isGuest ? "Save your account first: building a plan is for accounts." : "Your plan comes from your coach.");
      }
    }
    for (const d of args.days) {
      for (const e of d.exercises) {
        if (!parseSetsReps(e.prescription, `${e.exercise} ${e.notes ?? ""}`)) {
          throw invalid(`"${e.prescription}" (${e.exercise}, ${d.name}) isn't sets x reps. Write it like 3x8-10, 3x30 sec or 1x20 min.`);
        }
      }
    }

    // The outline as the importer reads a sheet: week 1 written out, repeated for the plan's length.
    let grid: SheetGrid = {
      programName: args.name,
      days: args.days.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => ({ name: e.exercise, notes: e.notes, label: e.group, weeks: [{ week: 1, setsReps: e.prescription }] })) })),
    };
    const gaps = coreGaps(grid);
    if (args.addSuggestedCore) for (const g of gaps) grid = addSuggestion(grid, g.day, g.slug);
    const rangesAdded = rangeAddedLines(grid);

    // Every name matched to what this person already logs first, so the plan continues their lifts (resolveForClient);
    // one nothing knows is created for this workspace, never dropped.
    const asWritten = Array.from(new Set(args.days.flatMap((d) => d.exercises.map((e) => e.exercise))));
    const found = await resolveForClient(Array.from(new Set(grid.days.flatMap((d) => d.exercises.map((e) => e.name)))), client);

    // Live now for an athlete's own plan, and for a coach's OWN training (no coach screen shows a draft of it, so a draft
    // there could never be assigned). A coach writing for a client still gets a draft.
    const ownTraining = caller.role !== "CLIENT" && (await prisma.clientProfile.findFirst({ where: { id: client.id, workspaceId: client.workspaceId }, select: { userId: true } }))?.userId === caller.userId;
    const live = caller.role === "CLIENT" || ownTraining;
    const previous = live ? await prisma.programAssignment.findMany({ where: { clientId: client.id, workspaceId: client.workspaceId, status: "ACTIVE" }, select: { id: true, name: true } }) : [];
    const saved = await saveSheetPlan({
      workspaceId: client.workspaceId,
      clientId: client.id,
      grid,
      name: args.name,
      goals: args.goals,
      weekOneStart: args.startDate ? new Date(`${args.startDate}T00:00:00`) : null,
      // "Today" is the person's today (zoneFor), not the server's: after 7 pm in New York, UTC is already tomorrow. Plan
      // dates are calendar days (the server's midnight of the day, read back with iso), so a given startDate is that day as written.
      today: new Date(`${localDay(new Date(), await zoneFor(client, args.timezone))}T12:00:00`),
      context: { durationWeeks: args.weeks, trainingDays: null, startAtWeek: 1 },
      history: false,
      status: live ? "ACTIVE" : "PAUSED",
      matched: found,
    });

    return {
      client: client.fullName,
      assignmentId: saved.assignmentId,
      status: live ? "ACTIVE" : "DRAFT",
      weeks: saved.weeks,
      daysPerWeek: saved.days,
      exercises: asWritten.map((n) => ({ asWritten: n, matched: found.get(n)!.name, exerciseId: found.get(n)!.id, how: found.get(n)!.how })),
      rangesAdded,
      coreWork: gaps.map((g) => ({ day: g.dayName, suggestion: `${g.name}, ${g.dose}`, added: args.addSuggestedCore })),
      previousPlan: live
        ? previous.map((p) => ({ assignmentId: p.id, name: p.name, status: "COMPLETED", history: "kept" }))
        : "The live plan is unchanged until the coach assigns this draft in Atlas.",
      next: live ? "It's the live plan now: get_active_program shows it." : "A draft: the coach checks it and assigns it from the client's Plan tab in Atlas.",
    };
  },
});
