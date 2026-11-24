import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("challenges: a chip on Home, a home for managing them on You", () => {
  it("Home shows one small chip under the greeting, not the big card", () => {
    expect(read("components/goals/GoalToday.tsx")).toContain("<GoalChip");
    expect(read("components/goals/GoalToday.tsx")).not.toContain("<GoalCard");
    const today = read("components/athlete/TodayScreen.tsx");
    expect(today.indexOf("{athlete.firstName}")).toBeLessThan(today.indexOf("{goal}"));
    expect(today.indexOf("{goal}")).toBeLessThan(today.indexOf("Week {next.week}"));
  });
  it("the chip says the day, the length and the name, and opens the challenge", () => {
    const chip = read("components/goals/GoalChip.tsx");
    expect(chip).toContain("Day {view.dayOfGoal} of {view.length} · {view.name}");
    expect(chip).toContain("/challenges/${view.goalId}");
  });
  it("the challenge page ends it (today) or deletes it, after a question", () => {
    const foot = read("components/challenges/ChallengeFooter.tsx");
    expect(foot).toContain("End today");
    expect(foot).toContain("This can't be undone");
    expect(read("app/(client)/challenges/[id]/page.tsx")).toContain("remove={deleteGoal}");
  });
  it("deleting is only your own goal, and it removes its check-ins (cascade)", () => {
    expect(read("lib/actions/goals.ts")).toContain("prisma.goal.deleteMany({ where: { id: goalId, clientId } })");
    expect(read("prisma/schema.prisma")).toMatch(/goal\s+Goal\s+@relation\(fields: \[goalId\], references: \[id\], onDelete: Cascade\)/);
  });
  it("You lists the challenges", () => {
    expect(read("components/athlete/YouScreen.tsx")).toContain("{challenges}");
    expect(read("components/challenges/ChallengesList.tsx")).toContain("Running · since");
  });
});
