"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { COLUMN_ROLES, MAX_ROWS, guessMapping, type ClientStatus, type ColumnRole, type DuplicateChoice } from "@/lib/clients/import";
import { cn } from "@/lib/utils";

type PreviewRow = {
  row: number;
  action: "create" | "merge" | "possible_duplicate" | "skip_duplicate" | "skip_name_only" | "invalid";
  name?: string;
  email?: string | null;
  phone?: string | null;
  goal?: string | null;
  status?: ClientStatus;
  details?: number;
  warnings?: string[];
  existing?: { id: string; name: string };
  matchedOn?: "name" | "phone";
  reason?: string;
};
type Summary = { create: number; merge: number; possibleDuplicates: number; skippedDuplicates: number; skippedNameOnly: number; invalid: number };
type Result = { row: number; name: string; outcome: "created" | "updated" | "failed"; clientId?: string; error?: string };

const GOAL_LABEL: Record<string, string> = { weight_loss: "Weight loss", hypertrophy: "Hypertrophy", pain_mgmt: "Pain management", performance: "Performance", general: "General fitness" };
const STATUS_LABEL: Record<ClientStatus, string> = { ACTIVE: "Active", PROSPECT: "Prospect", AT_RISK: "At risk", CHURNED: "Churned" };

const primary = "press flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[15px] font-semibold text-white hover:bg-ink/85 disabled:opacity-40";
const secondary = "press flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 text-[15px] font-semibold text-ink hover:border-ink/25";
const select = "h-10 w-full rounded-lg border border-line bg-white px-2.5 text-[14px] text-ink outline-none focus:border-ink/40";

export default function ImportClientsPage() {
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnRole[]>([]);
  const [defaultStatus, setDefaultStatus] = useState<ClientStatus>("ACTIVE");
  const [preview, setPreview] = useState<{ summary: Summary; rows: PreviewRow[] } | null>(null);
  const [choices, setChoices] = useState<Record<number, DuplicateChoice>>({});
  const [done, setDone] = useState<{ summary: Summary; results: Result[]; skipped: PreviewRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function readFile(file: File) {
    setError(null);
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setError("That isn't a CSV. In Google Sheets use File → Download → CSV; in Excel, Save As → CSV.");
      return;
    }
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => {
        const all = res.data.map((r) => r.map((c) => (c ?? "").toString()));
        if (all.length < 2) {
          setError("The file needs a header row and at least one client.");
          return;
        }
        const [head, ...body] = all;
        if (body.length > MAX_ROWS) {
          setError(`That's ${body.length} rows. Import up to ${MAX_ROWS} at a time; split the file and import it in parts.`);
          return;
        }
        const width = Math.max(head.length, ...body.map((r) => r.length));
        const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
        const hdrs = pad(head).map((h, i) => h.trim() || `Column ${i + 1}`);
        setFileName(file.name);
        setHeaders(hdrs);
        setRows(body.map(pad));
        setMapping(guessMapping(pad(head)));
        setStep("map");
      },
      error: () => setError("That file couldn't be read."),
    });
  }

  async function send(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, headers, rows, mapping, defaultStatus, choices, dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Nothing was imported.");
        if (data?.rows) setPreview({ summary: data.summary, rows: data.rows });
        return;
      }
      if (dryRun) {
        setPreview(data);
        // Each possible duplicate starts as "fill in the existing client"; the coach can change it.
        setChoices((prev) => {
          const next = { ...prev };
          for (const r of data.rows as PreviewRow[]) if (r.action === "possible_duplicate" && !next[r.row]) next[r.row] = "merge";
          return next;
        });
        setStep("preview");
      } else {
        setDone(data);
        setStep("done");
      }
    } catch {
      setError("Couldn't reach the server. Nothing was imported.");
    } finally {
      setBusy(false);
    }
  }

  const named = mapping.includes("fullName") || mapping.includes("firstName") || mapping.includes("lastName");
  const dupes = preview?.rows.filter((r) => r.action === "possible_duplicate") ?? [];
  const willCreate = (preview?.rows ?? []).filter((r) => r.action === "create" || (r.action === "possible_duplicate" && choices[r.row] === "create"));
  const willMerge = (preview?.rows ?? []).filter((r) => r.action === "merge" || (r.action === "possible_duplicate" && choices[r.row] === "merge"));
  const skipped = (preview?.rows ?? []).filter((r) => r.action === "skip_duplicate" || r.action === "skip_name_only" || r.action === "invalid");

  return (
    <div className="max-w-4xl">
      <Link href="/clients" className="press -ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Roster
      </Link>
      <div className="rise mb-8 mt-3">
        <h1 className="text-4xl leading-none text-ink">Import clients</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          Bring your client list over from a spreadsheet. You&apos;ll see exactly what will happen before anything is saved.
        </p>
        <ol className="mt-5 flex gap-1.5" aria-label="Steps">
          {["Upload", "Match columns", "Review", "Done"].map((label, i) => {
            const at = ["upload", "map", "preview", "done"].indexOf(step);
            return (
              <li key={label} className="flex-1">
                <span className={cn("block h-1 rounded-full", i <= at ? "bg-signal" : "bg-ink/10")} />
                <span className={cn("mt-1.5 block text-[12px] font-medium", i === at ? "text-ink" : "text-ink-mute")}>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {error && (
        <p role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* ── 1. Upload ─────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="rise rise-1">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) readFile(f);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
              dragging ? "border-signal bg-signal/5" : "border-line bg-white hover:border-ink/25"
            )}
          >
            <Upload className="h-7 w-7 text-ink-mute" />
            <span className="mt-3 text-[16px] font-semibold text-ink">Choose a CSV file, or drop it here</span>
            <span className="mt-1 text-sm text-ink-mute">One client per row, with a header row. Up to {MAX_ROWS} clients.</span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f);
              e.target.value = "";
            }}
          />
          <div className="mt-6 grid gap-4 text-[14px] leading-relaxed text-ink-soft sm:grid-cols-3">
            <p>
              <span className="font-semibold text-ink">From Google Sheets:</span> File → Download → Comma-separated values (.csv).
            </p>
            <p>
              <span className="font-semibold text-ink">From Excel or Numbers:</span> Save As / Export → CSV.
            </p>
            <p>
              <span className="font-semibold text-ink">Any layout works.</span> You&apos;ll match your columns to Atlas&apos;s fields next.
            </p>
          </div>
        </div>
      )}

      {/* ── 2. Map columns ────────────────────────────────────────────── */}
      {step === "map" && (
        <div className="rise rise-1 space-y-6">
          <p className="flex items-center gap-2 text-[15px] text-ink">
            <FileSpreadsheet className="h-4 w-4 text-ink-mute" />
            <span className="font-semibold">{fileName}</span>
            <span className="text-ink-mute">
              · {rows.length} row{rows.length === 1 ? "" : "s"}, {headers.length} columns
            </span>
          </p>

          <div className="surface divide-y divide-line">
            {headers.map((h, i) => {
              const samples = rows
                .map((r) => r[i]?.trim())
                .filter(Boolean)
                .slice(0, 3);
              return (
                <div key={i} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center sm:gap-6">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">{h}</p>
                    <p className="truncate text-[13px] text-ink-mute">{samples.length > 0 ? samples.join(" · ") : "empty"}</p>
                  </div>
                  <select
                    aria-label={`What is "${h}"?`}
                    value={mapping[i]}
                    onChange={(e) => setMapping((m) => m.map((v, j) => (j === i ? (e.target.value as ColumnRole) : v)))}
                    className={select}
                  >
                    {COLUMN_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="surface grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center sm:gap-6">
            <div>
              <p className="text-[15px] font-semibold text-ink">Status when the sheet doesn&apos;t say</p>
              <p className="text-[13px] text-ink-mute">Words like &quot;current&quot; or &quot;paused&quot; in a status column are read automatically.</p>
            </div>
            <select aria-label="Default status" value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value as ClientStatus)} className={select}>
              <option value="ACTIVE">Active: clients I train now</option>
              <option value="PROSPECT">Prospect: leads, not clients yet</option>
              <option value="AT_RISK">At risk</option>
              <option value="CHURNED">Churned: past clients</option>
            </select>
          </div>

          <p className="text-[13px] leading-relaxed text-ink-mute">
            Columns set to &quot;Keep as imported detail&quot; are saved on each client&apos;s page. Use &quot;Don&apos;t import&quot; for anything you don&apos;t want
            stored, like payment details.
          </p>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => setStep("upload")} className={secondary}>
              Choose another file
            </button>
            <button type="button" onClick={() => send(true)} disabled={!named || busy} className={primary}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Review the import <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
          {!named && <p className="text-right text-[13px] text-warn">Choose which column holds the client&apos;s name.</p>}
        </div>
      )}

      {/* ── 3. Review ─────────────────────────────────────────────────── */}
      {step === "preview" && preview && (
        <div className="rise rise-1 space-y-8">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            {[
              { label: "New clients", value: willCreate.length },
              { label: "Existing, filled in", value: willMerge.length },
              { label: "Skipped", value: skipped.length + dupes.filter((d) => choices[d.row] === "skip").length },
              { label: "Possible duplicates", value: dupes.length },
            ].map((s) => (
              <div key={s.label} className="bg-white p-4">
                <p className="eyebrow">{s.label}</p>
                <p className="mt-1 text-3xl font-semibold text-ink">{s.value}</p>
              </div>
            ))}
          </div>

          {dupes.length > 0 && (
            <section>
              <h2 className="text-xl text-ink">Already on your roster?</h2>
              <p className="mt-1 text-[14px] text-ink-soft">These match a client you have by name or phone. Filling in adds the sheet&apos;s email, phone and goal where the client has none; nothing is overwritten.</p>
              <ul className="rule mt-3 divide-y divide-line">
                {dupes.map((d) => (
                  <li key={d.row} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-ink">
                        Row {d.row} · {d.name}
                      </p>
                      <p className="text-[13px] text-ink-mute">
                        Same {d.matchedOn} as <span className="font-medium text-ink-soft">{d.existing?.name}</span>
                        {d.email ? ` · ${d.email}` : ""}
                        {d.phone ? ` · ${d.phone}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 rounded-lg border border-line bg-white p-0.5" role="radiogroup" aria-label={`Row ${d.row}`}>
                      {(
                        [
                          ["merge", "Fill in existing"],
                          ["create", "Add as new"],
                          ["skip", "Skip"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={choices[d.row] === value}
                          onClick={() => setChoices((c) => ({ ...c, [d.row]: value }))}
                          className={cn("press rounded-md px-3 py-1.5 text-[13px] font-medium", choices[d.row] === value ? "bg-ink text-white" : "text-ink-soft hover:text-ink")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {willCreate.length > 0 && (
            <section>
              <h2 className="text-xl text-ink">New clients</h2>
              <ul className="rule mt-3 divide-y divide-line">
                {willCreate.map((r) => (
                  <li key={r.row} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-[15px] font-semibold text-ink">{r.name}</p>
                      <p className="text-[13px] text-ink-mute">
                        {r.status ? STATUS_LABEL[r.status] : ""}
                        {r.goal ? ` · ${GOAL_LABEL[r.goal] ?? r.goal}` : ""}
                        {r.details ? ` · ${r.details} detail${r.details === 1 ? "" : "s"}` : ""}
                      </p>
                    </div>
                    <p className="text-[13px] text-ink-soft">{[r.email, r.phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                    {r.warnings?.map((w) => (
                      <p key={w} className="text-[12.5px] text-warn">
                        Row {r.row}: {w}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {skipped.length > 0 && (
            <section>
              <h2 className="text-xl text-ink">Skipped</h2>
              <ul className="rule mt-3 divide-y divide-line">
                {skipped.map((r) => (
                  <li key={r.row} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
                    <span className="min-w-0 truncate text-ink">
                      Row {r.row}
                      {r.name ? ` · ${r.name}` : ""}
                    </span>
                    <span className="shrink-0 text-right text-[13px] text-ink-mute">
                      {r.action === "skip_name_only" ? "name only: no email, phone or goal" : r.reason ?? "skipped"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => setStep("map")} className={secondary}>
              <ArrowLeft className="h-4 w-4" /> Change columns
            </button>
            <button type="button" onClick={() => send(false)} disabled={busy || willCreate.length + willMerge.length === 0} className={primary}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Import {willCreate.length} new{willMerge.length > 0 ? `, update ${willMerge.length}` : ""} <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── 4. Done ───────────────────────────────────────────────────── */}
      {step === "done" && done && (
        <div className="rise rise-1 space-y-8">
          {(() => {
            const created = done.results.filter((r) => r.outcome === "created");
            const updated = done.results.filter((r) => r.outcome === "updated");
            const failed = done.results.filter((r) => r.outcome === "failed");
            const dup = done.skipped.filter((r) => r.action === "skip_duplicate");
            const nameOnly = done.skipped.filter((r) => r.action === "skip_name_only");
            const invalid = done.skipped.filter((r) => r.action === "invalid");
            return (
              <>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal text-white">
                    <Check className="h-5 w-5" strokeWidth={3} />
                  </span>
                  <div>
                    <h2 className="text-2xl text-ink">
                      {created.length} client{created.length === 1 ? "" : "s"} imported
                      {updated.length > 0 ? `, ${updated.length} updated` : ""}
                    </h2>
                    <p className="mt-1 text-[14px] text-ink-soft">
                      {dup.length} skipped as duplicates · {nameOnly.length} skipped as name only · {invalid.length + failed.length} couldn&apos;t be imported
                    </p>
                  </div>
                </div>

                {failed.length + invalid.length > 0 && (
                  <section>
                    <h3 className="text-lg text-ink">Couldn&apos;t be imported</h3>
                    <ul className="rule mt-2 divide-y divide-line">
                      {[...failed.map((f) => ({ row: f.row, name: f.name, why: f.error ?? "couldn't be saved" })), ...invalid.map((r) => ({ row: r.row, name: r.name ?? "", why: r.reason ?? "" }))]
                        .sort((a, b) => a.row - b.row)
                        .map((r) => (
                          <li key={r.row} className="flex justify-between gap-4 py-2.5 text-[14px]">
                            <span className="text-ink">
                              Row {r.row}
                              {r.name ? ` · ${r.name}` : ""}
                            </span>
                            <span className="text-right text-[13px] text-destructive">{r.why}</span>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}

                {dup.length + nameOnly.length > 0 && (
                  <section>
                    <h3 className="text-lg text-ink">Skipped</h3>
                    <ul className="rule mt-2 divide-y divide-line">
                      {[...dup, ...nameOnly]
                        .sort((a, b) => a.row - b.row)
                        .map((r) => (
                          <li key={r.row} className="flex justify-between gap-4 py-2.5 text-[14px]">
                            <span className="text-ink">
                              Row {r.row} · {r.name}
                            </span>
                            <span className="text-right text-[13px] text-ink-mute">{r.action === "skip_name_only" ? "name only" : r.reason}</span>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link href="/clients" className={primary}>
                    Go to roster <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("upload");
                      setPreview(null);
                      setDone(null);
                      setChoices({});
                    }}
                    className={secondary}
                  >
                    Import another file
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
