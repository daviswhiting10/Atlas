/**
 * Client import from a spreadsheet (CSV), for any coach.
 *
 * Pure: no I/O. The browser parses the file and the coach maps columns; the
 * server runs `normalizeRows` and `planImport` again on what it receives (it
 * never trusts the browser's version) and then writes the plan.
 */

import { z } from "zod";
import { interpretGoal } from "@/lib/plan/goal";
import { GOALS } from "@/lib/plan/generator";

export type ClientStatus = "PROSPECT" | "ACTIVE" | "AT_RISK" | "CHURNED";

/** What a sheet column can be mapped to. */
export type ColumnRole = "fullName" | "firstName" | "lastName" | "email" | "phone" | "goal" | "status" | "lastContact" | "keep" | "ignore";

export const COLUMN_ROLES: Array<{ value: ColumnRole; label: string }> = [
  { value: "fullName", label: "Full name" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "goal", label: "Goal" },
  { value: "status", label: "Status" },
  { value: "lastContact", label: "Last session / contact date" },
  { value: "keep", label: "Keep as imported detail" },
  { value: "ignore", label: "Don't import" },
];

export const GOAL_CODES = ["weight_loss", "hypertrophy", "pain_mgmt", "performance", "general"] as const;
export type GoalCode = (typeof GOAL_CODES)[number];

export const MAX_ROWS = 2000;

// ── Column guessing ─────────────────────────────────────────────────────────

const GUESSES: Array<[ColumnRole, RegExp]> = [
  ["email", /e-?mail/i],
  ["phone", /phone|mobile|cell|tel\b|telephone/i],
  ["firstName", /^first(\s*name)?$|^given/i],
  ["lastName", /^last(\s*name)?$|^surname|^family/i],
  ["fullName", /^(full\s*)?name$|^client(\s*name)?$|^member(\s*name)?$|^athlete$/i],
  ["goal", /goal|objective/i],
  ["status", /status|state|active/i],
  ["lastContact", /last\s*(session|visit|contact|seen|workout|check)/i],
];

/** Headers that look like payment, banking, identity or login data: never kept unless the coach chooses to. */
const SENSITIVE = /\b(card|cc|cvv|cvc|iban|ssn|password|passport)\b|credit\s*card|debit|account\s*(no|num|#)|routing|bank\s*(account|acct|details)|social\s*security|licen[cs]e\s*(no|num|#)|\bpin\b/i;

/**
 * A first guess at what each column is, from its header. Unrecognised columns
 * are kept as imported details, except anything that looks like payment or
 * identity data, which starts as "Don't import". The coach changes anything
 * that's wrong. Each core field is guessed at most once (the first match).
 */
export function guessMapping(headers: string[]): ColumnRole[] {
  const taken = new Set<ColumnRole>();
  return headers.map((h) => {
    const header = h.trim();
    if (!header || SENSITIVE.test(header)) return "ignore";
    for (const [role, re] of GUESSES) {
      if (!taken.has(role) && re.test(header)) {
        taken.add(role);
        return role;
      }
    }
    return "keep";
  });
}

// ── Field normalisation ─────────────────────────────────────────────────────

const EmailShape = z.string().email();

/** Trim, lowercase, drop "mailto:", and take the first of several addresses. */
export function normalizeEmail(raw: string): { email: string | null; warning: string | null } {
  const first = raw.trim().replace(/^mailto:/i, "").split(/[;,\s]+/).filter(Boolean)[0] ?? "";
  if (!first) return { email: null, warning: null };
  const email = first.toLowerCase();
  if (!EmailShape.safeParse(email).success) return { email: null, warning: `email "${raw.trim()}" isn't valid, so it was left out` };
  const extra = raw.trim().split(/[;,\s]+/).filter(Boolean).length > 1;
  return { email, warning: extra ? `several emails; used ${email}` : null };
}

/** Digits only, last ten: enough to tell whether two phone numbers are the same person. */
export const phoneKey = (phone: string | null | undefined) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
};

/** Case- and spacing-insensitive name, for spotting the same person. */
export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const STATUS_WORDS: Array<[ClientStatus, RegExp]> = [
  ["CHURNED", /churn|cancel|former|lost|ended|quit|left|past|inactive|closed/i],
  ["AT_RISK", /risk|paus|hold|lapse|lapsing|frozen|freeze|slipping/i],
  ["PROSPECT", /prospect|lead|trial|consult|potential|interested|new lead|enquir|inquir/i],
  ["ACTIVE", /active|current|training|member|ongoing|yes|^y$|client/i],
];

/** A sheet's status word mapped to Atlas's statuses; null when it's not recognised. */
export function parseStatus(raw: string): ClientStatus | null {
  const v = raw.trim();
  if (!v) return null;
  const upper = v.toUpperCase().replace(/[\s-]+/g, "_");
  if (upper === "PROSPECT" || upper === "ACTIVE" || upper === "AT_RISK" || upper === "CHURNED") return upper;
  for (const [status, re] of STATUS_WORDS) if (re.test(v)) return status;
  return null;
}

/**
 * The goal as Atlas's code (what the roster, charts and milestones key on),
 * read from the sheet's own words with the same goal reader the plan wizard
 * uses. Pain or rehab with no other goal is pain management.
 */
export function parseGoal(raw: string): GoalCode | null {
  const v = raw.trim();
  if (!v) return null;
  const code = v.toLowerCase().replace(/[\s-]+/g, "_");
  if ((GOAL_CODES as readonly string[]).includes(code)) return code as GoalCode;
  if (/pain|rehab|injur|recover|mobility|posture|physio/i.test(v)) {
    const read = interpretGoal(v);
    if (!read.goal) return "pain_mgmt";
  }
  const read = interpretGoal(v);
  if (read.goal) return GOALS[read.goal].primaryGoal as GoalCode;
  if (read.conditions.length > 0) return "pain_mgmt";
  return "general";
}

/** A date from a sheet cell (ISO, US m/d/y, or anything Date understands); never in the future. */
export function parseDate(raw: string, now: Date): Date | null {
  const v = raw.trim();
  if (!v) return null;
  const us = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  let d: Date;
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    d = new Date(year, Number(us[1]) - 1, Number(us[2]), 12);
  } else {
    d = new Date(v);
  }
  if (Number.isNaN(d.getTime()) || d.getTime() > now.getTime() + 86_400_000 || d.getFullYear() < 1990) return null;
  return d;
}

// ── Rows ────────────────────────────────────────────────────────────────────

export type ImportOptions = {
  /** Status for rows whose sheet doesn't give one (or gives one Atlas doesn't recognise). */
  defaultStatus: ClientStatus;
};

export type ClientRow = {
  /** 1-based row number in the sheet, counting the header as row 1. */
  row: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  primaryGoal: GoalCode | null;
  status: ClientStatus;
  lastContactAt: Date | null;
  /** Everything kept that isn't a core field, by column header (plus the goal as written). */
  details: Record<string, string>;
  warnings: string[];
};

export type RowOutcome =
  | { kind: "client"; client: ClientRow }
  | { kind: "name_only"; row: number; name: string }
  | { kind: "invalid"; row: number; reason: string };

/**
 * One sheet row into a client, or the reason it can't be one.
 * A row needs a name, plus an email, phone or goal: a name alone can't be
 * contacted, invited or coached, so it's skipped, never guessed at.
 */
export function normalizeRow(cells: string[], headers: string[], mapping: ColumnRole[], options: ImportOptions, row: number, now = new Date()): RowOutcome {
  const get = (role: ColumnRole) => {
    const i = mapping.indexOf(role);
    return i >= 0 ? (cells[i] ?? "").trim() : "";
  };
  const warnings: string[] = [];

  const fullName = (get("fullName") || [get("firstName"), get("lastName")].filter(Boolean).join(" ")).replace(/\s+/g, " ").trim().slice(0, 120);
  if (cells.every((c) => !c?.trim())) return { kind: "invalid", row, reason: "empty row" };
  if (!fullName) return { kind: "invalid", row, reason: "no name" };

  const { email, warning: emailWarning } = normalizeEmail(get("email"));
  if (emailWarning) warnings.push(emailWarning);
  const phone = get("phone").slice(0, 40) || null;

  const goalText = get("goal");
  const primaryGoal = parseGoal(goalText);

  const statusText = get("status");
  const parsedStatus = parseStatus(statusText);
  if (statusText && !parsedStatus) warnings.push(`status "${statusText}" not recognised; set to ${options.defaultStatus.toLowerCase().replace("_", " ")}`);
  const status = parsedStatus ?? options.defaultStatus;

  const contactText = get("lastContact");
  const lastContactAt = parseDate(contactText, now);
  if (contactText && !lastContactAt) warnings.push(`date "${contactText}" not understood`);

  const details: Record<string, string> = {};
  mapping.forEach((role, i) => {
    const value = (cells[i] ?? "").trim();
    if (role === "keep" && value) details[(headers[i] ?? "").trim() || `Column ${i + 1}`] = value.slice(0, 2000);
  });
  // The goal in the client's own words is worth more than the code it maps to.
  if (goalText && goalText.toLowerCase().replace(/[\s-]+/g, "_") !== primaryGoal) details["Goal (as written)"] = goalText.slice(0, 2000);

  if (!email && !phone && !primaryGoal) return { kind: "name_only", row, name: fullName };

  return { kind: "client", client: { row, fullName, email, phone, primaryGoal, status, lastContactAt, details, warnings } };
}

// ── Planning against the roster ─────────────────────────────────────────────

export type ExistingClient = { id: string; fullName: string; email: string | null; phone: string | null };

/** What the coach chose for a row that looks like someone already on the roster. */
export type DuplicateChoice = "merge" | "create" | "skip";

export type PlannedRow =
  | { action: "create"; client: ClientRow }
  /** Same person as an existing client by name or phone: fill in what the existing record is missing. */
  | { action: "merge"; client: ClientRow; existing: ExistingClient; matchedOn: "name" | "phone" }
  | { action: "possible_duplicate"; client: ClientRow; existing: ExistingClient; matchedOn: "name" | "phone" }
  | { action: "skip_duplicate"; client: ClientRow; existing: ExistingClient | null; reason: string }
  | { action: "skip_name_only"; row: number; name: string }
  | { action: "invalid"; row: number; reason: string };

/**
 * Decide what happens to each row.
 *  - Same email as a client already here: skipped as a duplicate.
 *  - Same email as an earlier row in this sheet: skipped as a duplicate.
 *  - Same name or phone as an existing client (no email match): a possible
 *    duplicate. Without a choice it stays unresolved; `choices` resolves it
 *    by sheet row number (merge, create anyway, or skip).
 */
export function planImport(outcomes: RowOutcome[], existing: ExistingClient[], choices: Record<number, DuplicateChoice> = {}): PlannedRow[] {
  const byEmail = new Map(existing.filter((c) => c.email).map((c) => [c.email!.trim().toLowerCase(), c]));
  const byName = new Map(existing.map((c) => [nameKey(c.fullName), c]));
  const byPhone = new Map(existing.flatMap((c) => (phoneKey(c.phone) ? [[phoneKey(c.phone)!, c] as const] : [])));
  const seenEmails = new Map<string, number>();

  return outcomes.map((o): PlannedRow => {
    if (o.kind === "invalid") return { action: "invalid", row: o.row, reason: o.reason };
    if (o.kind === "name_only") return { action: "skip_name_only", row: o.row, name: o.name };
    const c = o.client;

    if (c.email) {
      const there = byEmail.get(c.email);
      if (there) return { action: "skip_duplicate", client: c, existing: there, reason: `${c.email} is already on your roster (${there.fullName})` };
      const earlier = seenEmails.get(c.email);
      if (earlier != null) return { action: "skip_duplicate", client: c, existing: null, reason: `same email as row ${earlier}` };
      seenEmails.set(c.email, c.row);
    }

    const byNameMatch = byName.get(nameKey(c.fullName));
    const key = phoneKey(c.phone);
    const byPhoneMatch = key ? byPhone.get(key) : undefined;
    const match = byNameMatch ?? byPhoneMatch;
    if (match) {
      // A different email on file means a different person who shares a name.
      if (match.email && c.email && match.email.toLowerCase() !== c.email) return { action: "create", client: c };
      const matchedOn = byNameMatch ? "name" : "phone";
      const choice = choices[c.row];
      if (choice === "merge") return { action: "merge", client: c, existing: match, matchedOn };
      if (choice === "create") return { action: "create", client: c };
      if (choice === "skip") return { action: "skip_duplicate", client: c, existing: match, reason: `skipped: looks like ${match.fullName}, already on your roster` };
      return { action: "possible_duplicate", client: c, existing: match, matchedOn };
    }

    return { action: "create", client: c };
  });
}

export type ImportSummary = {
  create: number;
  merge: number;
  possibleDuplicates: number;
  skippedDuplicates: number;
  skippedNameOnly: number;
  invalid: number;
};

export function summarize(plan: PlannedRow[]): ImportSummary {
  const count = (a: PlannedRow["action"]) => plan.filter((p) => p.action === a).length;
  return {
    create: count("create"),
    merge: count("merge"),
    possibleDuplicates: count("possible_duplicate"),
    skippedDuplicates: count("skip_duplicate"),
    skippedNameOnly: count("skip_name_only"),
    invalid: count("invalid"),
  };
}
