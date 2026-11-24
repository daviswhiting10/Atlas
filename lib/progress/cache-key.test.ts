import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { progressKey } from "./cache-key";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const at = (iso: string) => new Date(iso);
const ana = { clientId: "client-ana", workspaceId: "ws-1", selfServe: false };
type Opts = Parameters<typeof progressKey>[1];
const base: Opts = { timeZone: "America/New_York", now: at("2026-11-24T15:00:00Z"), version: "v1" };
const key = (a = ana, o: Partial<Opts> = {}) => JSON.stringify(progressKey(a, { ...base, ...o }));

/** next/cache keys an entry on JSON.stringify(arguments): these tests are about that string. */
describe("the cached Progress is keyed per athlete", () => {
  it("two athletes never share an entry, even with the same rows and plan", () => {
    expect(key(ana)).not.toBe(key({ ...ana, clientId: "client-ben" }));
  });
  it("the same client id in another workspace is another entry", () => {
    expect(key(ana)).not.toBe(key({ ...ana, workspaceId: "ws-2" }));
  });
  it("whose it is leads the key", () => {
    expect(progressKey(ana, base).slice(0, 2)).toEqual(["client-ana", "ws-1"]);
  });
  it("a new fingerprint of the sets and sessions is a new entry (a set logged anywhere shows at once)", () => {
    expect(key(ana)).not.toBe(key(ana, { version: "v2" }));
  });
  it("a new timezone or day is a new entry", () => {
    expect(key(ana)).not.toBe(key(ana, { timeZone: "Europe/London" }));
    expect(key(ana)).not.toBe(key(ana, { now: at("2026-11-25T15:00:00Z") }));
  });
  it("the day is the athlete's own: 11 pm in New York is still the 24th", () => {
    expect(key(ana, { now: at("2026-11-25T04:00:00Z") })).toBe(key(ana));
  });
  it("the same inputs are the same entry", () => {
    expect(key(ana)).toBe(key({ ...ana }));
  });
});

describe("getProgress is wired to the key", () => {
  const data = read("lib/athlete/data.ts");
  const fn = data.slice(data.indexOf("export const getProgress"), data.indexOf("export async function loadProgress"));
  it("reads the fingerprint and builds the key from the signed-in athlete", () => {
    expect(fn).toContain("progressVersion(athlete.clientId)");
    expect(fn).not.toContain("getPlanOverview"); // the athlete's screens show no targets: the plan isn't waited for
    expect(fn).toContain("cachedProgress()(...progressKey(athlete, {");
  });
  it("the cached loader takes whose it is from its key, nowhere else", () => {
    expect(fn).toContain("(...[clientId, workspaceId, selfServe, timeZone]: ProgressKey) => loadProgress({ clientId, workspaceId, plan: null,");
    expect(fn).not.toMatch(/unstable_cache\([^]*getAthlete/);
  });
});

describe("the fingerprint covers every row field Progress reads", () => {
  const sql = read("lib/progress/version.ts");
  const data = read("lib/athlete/data.ts");
  const load = data.slice(data.indexOf("export async function loadProgress"), data.indexOf("// exercise → session → sets"));
  it("sets: lift, weight, reps, done, and which session", () => {
    for (const f of ["exerciseId", "weight", "reps", "completed", "workoutLogId"]) {
      expect(load).toContain(`${f}: true`);
      expect(sql).toMatch(new RegExp(`s\\.("${f}"|${f})`));
    }
  });
  it("sessions: the day, finished, and the plan workout behind it (lighter weeks)", () => {
    expect(load).toContain("completedAt: true");
    for (const f of ["l.date", 'l."completedAt"', 'l."assignedWorkoutId"']) expect(sql).toContain(f);
  });
  it("only this client's rows", () => {
    expect((sql.match(/l\."clientId" = \$\{clientId\}/g) ?? []).length).toBe(2);
  });
});
