import { format, parseISO } from "date-fns";
import { bodyWeightSummary, type BodyWeightPoint } from "@/lib/athlete/body-weight";

const W = 340;
const H = 120;

/** Progress: body weight over time (from the Me ⋯ menu's "Add body weight"). Nothing at all with no entries. */
export function BodyWeightSection({ points }: { points: BodyWeightPoint[] }) {
  const s = bodyWeightSummary(points);
  if (!s) return null;
  const t0 = parseISO(points[0].day).getTime();
  const span = Math.max(1, parseISO(points[points.length - 1].day).getTime() - t0);
  const x = (p: BodyWeightPoint) => (points.length === 1 ? W / 2 : ((parseISO(p.day).getTime() - t0) / span) * (W - 8) + 4);
  const y = (lb: number) => H - 6 - ((lb - s.min) / Math.max(1, s.max - s.min)) * (H - 12);
  const line = points.map((p) => `${x(p).toFixed(1)},${y(p.lb).toFixed(1)}`).join(" ");
  const change = s.change === 0 ? "no change" : `${s.change > 0 ? "+" : "−"}${Math.abs(s.change)} lb since ${format(parseISO(s.first.day), "MMM d")}`;
  return (
    <section className="mt-14" aria-label="Body weight">
      <h2 className="mb-3 flex min-h-11 items-center text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-mute">Body weight</h2>
      <p className="flex items-baseline gap-2">
        <span className="tnum text-[40px] font-semibold leading-none tracking-[-0.03em] text-ink">{s.latest.lb}</span>
        <span className="text-[15px] font-medium text-ink-mute">lb · {points.length > 1 ? change : format(parseISO(s.latest.day), "MMM d")}</span>
      </p>
      {points.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-[120px] w-full max-w-xl" role="img" aria-label={`Body weight from ${s.first.lb} to ${s.latest.lb} lb`}>
          <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="text-signal" />
          {points.length <= 60 && points.map((p) => <circle key={p.day} cx={x(p)} cy={y(p.lb)} r={2.5} className="fill-signal" />)}
        </svg>
      )}
      <p className="mt-2 text-[13px] text-ink-mute">Add a weigh-in from the ⋯ menu at the top.</p>
    </section>
  );
}
