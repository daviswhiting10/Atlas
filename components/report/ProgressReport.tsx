import type { Report, ReportChart } from "@/lib/report/build";
import { ReportBar } from "./ReportBar";
import styles from "./report.module.css";

const range = (a: string, b: string) => {
  const f = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(a)} – ${f(b)}, ${b.slice(0, 4)}`;
};

/** A thin line, week 1 to week 4, with a dot on the last week. The dot is its own element so the stretched line can't squash it. */
function Line({ series }: { series: (number | null)[] }) {
  const W = 150, H = 60, px = 6, py = 8;
  const pts = series.flatMap((v, i) => (v == null ? [] : [[i, v] as const]));
  const lo = Math.min(...pts.map((p) => p[1]));
  const span = Math.max(...pts.map((p) => p[1])) - lo || 1;
  const xy = pts.map(([i, v]) => [px + (i / Math.max(series.length - 1, 1)) * (W - 2 * px), H - py - ((v - lo) / span) * (H - 2 * py)]);
  const last = xy[xy.length - 1];
  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <polyline points={xy.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} fill="none" stroke="#111" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <i style={{ left: `${((last[0] / W) * 100).toFixed(2)}%`, top: `${((last[1] / H) * 100).toFixed(2)}%` }} />
    </div>
  );
}

function Figure({ c }: { c: ReportChart }) {
  return (
    <figure>
      <figcaption>
        <b>
          {c.name} {c.gain}
        </b>
        <span>{c.from}</span>
      </figcaption>
      <Line series={c.series} />
    </figure>
  );
}

/** The one-page report: no name, no block number, no coach. Printed, it is exactly one page. */
export function ProgressReport({ report: r }: { report: Report }) {
  const stats: [string, string][] = [[`${r.sessions} of ${r.planned || r.sessions}`, "sessions completed"]];
  if (!r.consistencyOnly) stats.push([`${r.improved} of ${r.eligible}`, "lifts improved"]);
  if (!r.consistencyOnly && r.third) stats.push(r.third.kind === "volume" ? [`+${r.third.value}%`, "total volume"] : [String(r.third.value), "PRs set"]);
  const cols = Math.min(Math.max(r.charts.length, 1), 4);
  const style = { "--stats": stats.length, "--cols": cols, "--chart-h": r.charts.length > 4 ? "150px" : "210px" } as React.CSSProperties;
  return (
    <div className={styles.screen} style={style}>
      <ReportBar />
      <article className={styles.page}>
        <div className={styles.top}>
          <span>Progress report</span>
          <span>{range(r.start, r.end)}</span>
        </div>
        <div className={styles.dbl} />
        <h1>{r.consistencyOnly ? "Four weeks in, and you showed up." : "Four weeks in, the work is paying off."}</h1>
        <div className={styles.thin} />
        <div className={styles.stats}>
          {stats.map(([n, l]) => (
            <div key={l} className={styles.stat}>
              <b>{n}</b>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <div className={styles.dbl} />
        {!r.consistencyOnly && (
          <div className={`${styles.grid} ${styles[`c${cols}`]}`}>
            {r.charts.map((c) => (
              <Figure key={c.exerciseId} c={c} />
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
