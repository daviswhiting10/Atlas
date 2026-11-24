import { describe, expect, it } from "vitest";
import { deleteSessionRows } from "./delete";

const fake = () => {
  const calls: string[] = [];
  const t = (name: string) => ({ deleteMany: async (a: unknown) => void calls.push(`${name}:${JSON.stringify(a)}`), delete: async (a: unknown) => void calls.push(`${name}:${JSON.stringify(a)}`) });
  return { calls, tx: { setLog: t("sets"), sessionNote: t("notes"), goalCheckIn: t("tags"), workoutLog: t("log") } };
};

describe("deleting a logged session", () => {
  it("removes its sets, notes and challenge tags, then the session itself, for that session only", async () => {
    const { calls, tx } = fake();
    await deleteSessionRows(tx as never, "log1");
    expect(calls.map((c) => c.split(":")[0])).toEqual(["sets", "notes", "tags", "log"]);
    expect(calls.every((c) => c.includes('"log1"'))).toBe(true);
  });
});

describe("the athlete's delete is only for their own sessions", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const src = readFileSync(new URL("../actions/athlete.ts", import.meta.url), "utf8");
  it("looks the session up by the signed-in athlete's client id, and deletes in one transaction", () => {
    const fn = src.slice(src.indexOf("export async function deleteMySession"));
    expect(fn).toContain("where: { id: parsed.data.workoutLogId, clientId }");
    expect(fn).toContain("prisma.$transaction((tx) => deleteSessionRows(tx, log.id))");
  });
  it("the Plan calendar offers it on a logged day, behind a confirm that says what goes", () => {
    const mini = readFileSync(new URL("../../components/athlete/SessionMini.tsx", import.meta.url), "utf8");
    expect(mini).toContain("Delete this session?");
    expect(mini).toContain("Sets you logged will be removed. This can&apos;t be undone.");
    expect(readFileSync(new URL("../../app/(client)/plan/page.tsx", import.meta.url), "utf8")).toContain("deleteSession={deleteMySession}");
    // The demo shows the summary but has no delete.
    expect(readFileSync(new URL("../../components/demo/DemoPlanHome.tsx", import.meta.url), "utf8")).not.toContain("deleteSession");
  });
});
