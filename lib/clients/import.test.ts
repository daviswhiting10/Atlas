import { describe, expect, it, vi } from "vitest";

// The writer imports createClient, which imports the DB client; nothing here touches a database.
vi.mock("@/lib/db/client", () => ({ prisma: {} }));

import { guessMapping, normalizeEmail, normalizeRow, parseDate, parseGoal, parseStatus, planImport, summarize, type ColumnRole, type ExistingClient } from "./import";
import { CSV_SOURCE, runImport, type ImportDb } from "./import-run";

const NOW = new Date("2026-11-11T12:00:00");
const opts = { defaultStatus: "ACTIVE" as const };

const HEADERS = ["Client", "E-mail", "Cell", "Goals", "Status", "Last session", "Injuries", "Card number"];
const MAPPING: ColumnRole[] = ["fullName", "email", "phone", "goal", "status", "lastContact", "keep", "ignore"];
const row = (cells: string[], n = 2) => normalizeRow(cells, HEADERS, MAPPING, opts, n, NOW);

describe("column mapping", () => {
  it("guesses common headers and keeps everything else as an imported detail", () => {
    expect(guessMapping(["Client Name", "Email Address", "Mobile", "Main goal", "Status", "Last Session", "Injuries", ""])).toEqual([
      "fullName",
      "email",
      "phone",
      "goal",
      "status",
      "lastContact",
      "keep",
      "ignore",
    ]);
  });

  it("starts payment and identity columns as \"Don't import\"", () => {
    expect(guessMapping(["Name", "Card Number", "CVV", "Billing account no", "SSN", "Password", "Notes"])).toEqual(["fullName", "ignore", "ignore", "ignore", "ignore", "ignore", "keep"]);
    // Training words that merely contain those letters are kept.
    expect(guessMapping(["Cardio preference", "Spin class", "Session credits"])).toEqual(["keep", "keep", "keep"]);
  });

  it("handles first / last name columns", () => {
    expect(guessMapping(["First Name", "Last Name", "Email"])).toEqual(["firstName", "lastName", "email"]);
    const r = normalizeRow(["Maya", "Torres", "maya@example.com"], ["First", "Last", "Email"], ["firstName", "lastName", "email"], opts, 2, NOW);
    expect(r.kind === "client" && r.client.fullName).toBe("Maya Torres");
  });
});

describe("field cleanup", () => {
  it("trims, lowercases and picks the first of several emails", () => {
    expect(normalizeEmail("  Sam@Example.COM ")).toEqual({ email: "sam@example.com", warning: null });
    expect(normalizeEmail("mailto:a@x.com; b@y.com").email).toBe("a@x.com");
    expect(normalizeEmail("not an email").email).toBeNull();
  });

  it("maps a sheet's status words, and leaves unknown ones to the default", () => {
    expect(parseStatus("Current")).toBe("ACTIVE");
    expect(parseStatus("Paused")).toBe("AT_RISK");
    expect(parseStatus("Former client")).toBe("CHURNED");
    expect(parseStatus("Inactive")).toBe("CHURNED");
    expect(parseStatus("Trial")).toBe("PROSPECT");
    expect(parseStatus("at risk")).toBe("AT_RISK");
    expect(parseStatus("purple")).toBeNull();
  });

  it("reads a goal in the client's own words as Atlas's goal code", () => {
    expect(parseGoal("Lose 20 lb before the wedding")).toBe("weight_loss");
    expect(parseGoal("Build muscle")).toBe("hypertrophy");
    expect(parseGoal("Get stronger, deadlift 400")).toBe("performance");
    expect(parseGoal("Lower back pain")).toBe("pain_mgmt");
    expect(parseGoal("hypertrophy")).toBe("hypertrophy");
    expect(parseGoal("")).toBeNull();
  });

  it("parses US and ISO dates, never the future", () => {
    expect(parseDate("10/28/2026", NOW)?.getDate()).toBe(28);
    expect(parseDate("2026-10-28", NOW)).not.toBeNull();
    expect(parseDate("12/25/2027", NOW)).toBeNull();
    expect(parseDate("soon", NOW)).toBeNull();
  });
});

describe("rows", () => {
  it("builds a client, keeping extra columns and dropping the ignored ones", () => {
    const r = row(["Sam Okafor", "SAM@EXAMPLE.COM", "(555) 010-2030", "lose fat, bad knees", "current", "10/28/2026", "Left knee", "4111 1111 1111 1111"]);
    expect(r.kind).toBe("client");
    if (r.kind !== "client") return;
    expect(r.client).toMatchObject({ fullName: "Sam Okafor", email: "sam@example.com", phone: "(555) 010-2030", primaryGoal: "weight_loss", status: "ACTIVE" });
    expect(r.client.lastContactAt?.getMonth()).toBe(9);
    expect(r.client.details).toEqual({ Injuries: "Left knee", "Goal (as written)": "lose fat, bad knees" });
    expect(JSON.stringify(r.client.details)).not.toContain("4111");
  });

  it("skips a name with nothing to reach them by and no goal, and never guesses", () => {
    expect(row(["Just A Name", "", "", "", "Active", "", "Has notes", ""])).toEqual({ kind: "name_only", row: 2, name: "Just A Name" });
  });

  it("counts a name with only a phone, or only a goal, as a client", () => {
    expect(row(["Priya", "", "555 123 4567", "", "", "", "", ""]).kind).toBe("client");
    expect(row(["Lee", "", "", "general fitness", "", "", "", ""]).kind).toBe("client");
  });

  it("drops a malformed email with a warning instead of the whole row", () => {
    const r = row(["Ana", "ana@", "555 999 0000", "", "", "", "", ""]);
    expect(r.kind === "client" && r.client.email).toBeNull();
    expect(r.kind === "client" && r.client.warnings[0]).toMatch(/isn't valid/);
  });

  it("rejects a row with no name, and passes over empty rows", () => {
    expect(row(["", "x@y.com", "", "", "", "", "", ""])).toEqual({ kind: "invalid", row: 2, reason: "no name" });
    expect(row(["", "", "", "", "", "", "", ""])).toMatchObject({ kind: "invalid", reason: "empty row" });
  });

  it("uses the chosen default when the sheet's status isn't recognised, and says so", () => {
    const r = row(["Kai", "kai@x.com", "", "", "purple", "", "", ""]);
    expect(r.kind === "client" && r.client.status).toBe("ACTIVE");
    expect(r.kind === "client" && r.client.warnings[0]).toMatch(/not recognised/);
  });
});

describe("duplicates", () => {
  const roster: ExistingClient[] = [
    { id: "c1", fullName: "Maya Torres", email: "maya@example.com", phone: null },
    { id: "c2", fullName: "Davis Lee", email: null, phone: null },
    { id: "c3", fullName: "Jordan Park", email: null, phone: "555-010-9999" },
  ];
  const sheet = [
    row(["Maya T", "Maya@Example.com", "", "", "", "", "", ""], 2), // same email as c1
    row(["davis  lee", "davis@example.com", "", "", "", "", "", ""], 3), // same name as c2, which has no email
    row(["J. Park", "", "(555) 010 9999", "", "", "", "", ""], 4), // same phone as c3
    row(["New Person", "new@example.com", "", "", "", "", "", ""], 5),
    row(["New Again", "NEW@example.com", "", "", "", "", "", ""], 6), // same email as row 5
    row(["Maya Torres", "other@example.com", "", "", "", "", "", ""], 7), // same name, different email: a different person
    row(["Name Only", "", "", "", "", "", "", ""], 8),
  ];

  it("skips email matches, asks about name or phone matches, and never treats a missing email as a match", () => {
    const plan = planImport(sheet, roster);
    expect(plan.map((p) => p.action)).toEqual(["skip_duplicate", "possible_duplicate", "possible_duplicate", "create", "skip_duplicate", "create", "skip_name_only"]);
    expect(summarize(plan)).toEqual({ create: 2, merge: 0, possibleDuplicates: 2, skippedDuplicates: 2, skippedNameOnly: 1, invalid: 0 });
  });

  it("resolves possible duplicates with the coach's choice", () => {
    const plan = planImport(sheet, roster, { 3: "merge", 4: "skip" });
    expect(plan[1]).toMatchObject({ action: "merge", matchedOn: "name", existing: { id: "c2" } });
    expect(plan[2]).toMatchObject({ action: "skip_duplicate" });
    expect(planImport(sheet, roster, { 3: "create" })[1].action).toBe("create");
  });
});

describe("writing", () => {
  function fakeDb(existing: Record<string, { id: string; workspaceId: string; email: string | null; phone: string | null; primaryGoal: string | null; lastContactAt: Date | null }>) {
    const calls: Array<{ op: string; args: unknown }> = [];
    let n = 0;
    const tx = {
      clientProfile: {
        create: async (args: { data: { fullName: string } }) => {
          calls.push({ op: "create", args });
          if (args.data.fullName === "Breaks") throw new Error("database said no");
          return { id: `new${++n}` };
        },
        findFirst: async (args: { where: { id: string; workspaceId: string } }) => {
          calls.push({ op: "findFirst", args });
          const e = existing[args.where.id];
          return e && e.workspaceId === args.where.workspaceId ? e : null;
        },
        update: async (args: unknown) => {
          calls.push({ op: "update", args });
          return {};
        },
      },
      intakeForm: {
        create: async (args: unknown) => {
          calls.push({ op: "intake", args });
          return {};
        },
      },
    };
    const db: ImportDb = { $transaction: (fn) => fn(tx as never) };
    return { db, calls };
  }

  it("stamps every new client with the coach's workspace and keeps extra columns as imported details", async () => {
    const plan = planImport([row(["New Person", "new@example.com", "", "", "", "", "Bad shoulder", ""])], []);
    const { db, calls } = fakeDb({});
    const results = await runImport(db, "ws_mine", plan, "clients.csv", NOW);
    expect(results).toEqual([{ row: 2, name: "New Person", outcome: "created", clientId: "new1" }]);
    expect(calls[0]).toMatchObject({ op: "create", args: { data: { workspaceId: "ws_mine", fullName: "New Person", email: "new@example.com", status: "ACTIVE" } } });
    expect(calls[1]).toMatchObject({ op: "intake", args: { data: { clientId: "new1", sourceType: CSV_SOURCE, parsedData: { fields: { Injuries: "Bad shoulder" } } } } });
  });

  it("only fills in what an existing client is missing, and only inside the coach's workspace", async () => {
    const roster: ExistingClient[] = [{ id: "c2", fullName: "Davis Lee", email: null, phone: "555 000 1111" }];
    const plan = planImport([row(["Davis Lee", "davis@example.com", "555 222 3333", "build muscle", "", "", "", ""])], roster, { 2: "merge" });
    const { db, calls } = fakeDb({ c2: { id: "c2", workspaceId: "ws_mine", email: null, phone: "555 000 1111", primaryGoal: null, lastContactAt: null } });
    const results = await runImport(db, "ws_mine", plan, "clients.csv", NOW);
    expect(results[0]).toMatchObject({ outcome: "updated", clientId: "c2" });
    expect(calls[0]).toMatchObject({ op: "findFirst", args: { where: { id: "c2", workspaceId: "ws_mine" } } });
    // Email and goal were missing; the phone on file is kept.
    expect(calls[1]).toEqual({ op: "update", args: { where: { id: "c2" }, data: { email: "davis@example.com", primaryGoal: "hypertrophy" } } });
  });

  it("never touches another workspace's client, even if a plan names one", async () => {
    const roster: ExistingClient[] = [{ id: "theirs", fullName: "Davis Lee", email: null, phone: null }];
    const plan = planImport([row(["Davis Lee", "davis@example.com", "", "", "", "", "", ""])], roster, { 2: "merge" });
    const { db, calls } = fakeDb({ theirs: { id: "theirs", workspaceId: "ws_other", email: null, phone: null, primaryGoal: null, lastContactAt: null } });
    const results = await runImport(db, "ws_mine", plan, "clients.csv", NOW);
    expect(results[0]).toMatchObject({ outcome: "failed" });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("reports a failed row and carries on with the rest", async () => {
    const plan = planImport([row(["Breaks", "b@x.com", "", "", "", "", "", ""], 2), row(["Fine", "f@x.com", "", "", "", "", "", ""], 3)], []);
    const { db } = fakeDb({});
    const results = await runImport(db, "ws_mine", plan, "clients.csv", NOW);
    expect(results.map((r) => r.outcome)).toEqual(["failed", "created"]);
    expect(results[0].error).toBe("database said no");
  });
});
