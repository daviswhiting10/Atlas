"use client";

import { memo, useCallback, useMemo } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import type { FocusMetric } from "@/lib/plan/generator";
import { chartKind, formatValue, targetValue, unitFor, type SessionPoint, type Target } from "@/lib/plan/overload";

type Row = {
  key: string;
  label: string;
  date: string | null;
  value: number | null;
  proj: number | null;
  record: boolean;
  best: boolean;
  deload: boolean;
  ghost: boolean;
};

const INK_MUTE = "var(--ink-mute)";
const GRID = "rgba(11,15,26,0.07)";
const DELOAD = "rgba(11,15,26,0.22)";

function ChartTooltip({
  active,
  payload,
  metric,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  metric: FocusMetric;
  unit: string;
}) {
  const row = active ? payload?.[0]?.payload : null;
  if (!row) return null;
  const v = row.ghost ? row.proj : row.value;
  if (v == null) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 shadow-md">
      <p className="text-[11px] text-ink-mute">{row.ghost ? "Next target" : row.date ? format(parseISO(row.date), "EEE, MMM d") : ""}</p>
      <p className="text-sm font-semibold text-ink">
        {formatValue(v, metric)} <span className="font-normal text-ink-mute">{unit}</span>
      </p>
      {row.record && <p className="text-[11px] font-medium text-gold">Personal record</p>}
      {row.best && <p className="text-[11px] font-medium text-signal">Best estimated 1RM yet</p>}
      {row.deload && <p className="text-[11px] text-ink-mute">Deload week — lighter on purpose</p>}
    </div>
  );
}

/** A dot on every data point: gold for a record, a ringed dot for a new best est. 1RM, grey for a deload week. */
function Dot(props: { cx?: number; cy?: number; payload?: Row }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload || payload.value == null) return null;
  if (payload.record) return <circle cx={cx} cy={cy} r={4} fill="var(--gold)" stroke="var(--bone)" strokeWidth={1.5} />;
  if (payload.best) return <circle cx={cx} cy={cy} r={3.5} fill="var(--bone)" stroke="var(--signal)" strokeWidth={2} />;
  if (payload.deload) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={3} fill="#B9BAB9" />
        <text x={cx} y={cy + 15} textAnchor="middle" fontSize={10} fill={INK_MUTE}>
          Deload
        </text>
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={2.5} fill="var(--signal)" />;
}

function GhostDot(props: { cx?: number; cy?: number; payload?: Row }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload?.ghost) return null;
  return <circle cx={cx} cy={cy} r={3.5} fill="var(--bone)" stroke="var(--signal)" strokeWidth={1.5} strokeDasharray="2 2" />;
}

/** One legend for every chart in the app, so the marks always mean the same thing. */
export function ChartLegend({ deload, target, best = false, loaded = true }: { deload: boolean; target: boolean; best?: boolean; loaded?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-ink-mute">
      <li className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-gold" /> Personal record ({loaded ? "heaviest weight yet" : "best set yet"})
      </li>
      {best && (
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border-2 border-signal" /> Best est. 1RM yet (more reps or a stronger set)
        </li>
      )}
      {deload && (
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: DELOAD }} /> Deload week (lighter on purpose)
        </li>
      )}
      {target && (
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t-[1.5px] border-dashed border-signal" /> Next target
        </li>
      )}
    </ul>
  );
}

/** Round an axis to friendly steps (5, 10, 25, 500…). Bars always start at zero. */
function axis(values: number[], fromZero: boolean) {
  const min = fromZero ? 0 : Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, max * 0.06, 2);
  const raw = span / (fromZero ? 4 : 3);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw);
  const lo = fromZero ? 0 : Math.max(0, Math.floor((min - step * 0.4) / step) * step);
  // Bars need only a little headroom above the tallest one (room for a label).
  const hi = Math.ceil((max + step * (fromZero ? 0.12 : 0.3)) / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  return { domain: [lo, hi] as [number, number], ticks };
}

// Memoised: a parent that re-renders on a timer (the workout logger) would
// otherwise restart the draw-in animation on every tick.
export const ProgressChart = memo(function ProgressChart({
  series,
  metric,
  loaded,
  target,
  height = 260,
  chartKey,
  legend = true,
  timed = false,
}: {
  series: SessionPoint[];
  metric: FocusMetric;
  loaded: boolean;
  target?: Target | null;
  height?: number;
  /** Change this to replay the draw-in animation (e.g. when switching exercise). */
  chartKey?: string;
  legend?: boolean;
  /** The exercise is measured in seconds rather than reps. */
  timed?: boolean;
}) {
  const unit = unitFor(metric, loaded, timed);
  const bars = chartKind(metric) === "bars";

  const { rows, domain, ticks, hasGhost } = useMemo(() => {
    const rows: Row[] = series.map((p, i) => ({
      key: `${p.date}-${i}`,
      label: format(parseISO(p.date), "MMM d"),
      date: p.date,
      value: p[metric] ?? null,
      proj: null,
      record: p.record,
      best: p.best,
      deload: p.deload,
      ghost: false,
    }));
    const lastReal = rows.length - 1;
    // A projected next point only makes sense on a trend line.
    const ghost = bars ? null : targetValue(target, metric);
    const hasGhost = ghost != null && rows.length > 0 && rows[lastReal].value != null;
    if (hasGhost) {
      rows[lastReal].proj = rows[lastReal].value;
      rows.push({ key: "next", label: "Next", date: null, value: null, proj: ghost, record: false, best: false, deload: false, ghost: true });
    }
    const values = rows.flatMap((r) => [r.value, r.proj]).filter((v): v is number => v != null);
    return { rows, hasGhost, ...axis(values.length > 0 ? values : [0], bars) };
  }, [series, metric, target, bars]);

  const renderDot = useCallback((p: object) => <Dot {...(p as object)} key={(p as { index: number }).index} />, []);
  const renderGhost = useCallback((p: object) => <GhostDot {...(p as object)} key={(p as { index: number }).index} />, []);
  const deloadLabel = useCallback(
    (p: { x?: number | string; y?: number | string; width?: number | string; index?: number }) =>
      p.index != null && rows[p.index]?.deload ? (
        <text x={Number(p.x) + Number(p.width) / 2} y={Number(p.y) - 6} textAnchor="middle" fontSize={10} fill={INK_MUTE}>
          Deload
        </text>
      ) : null,
    [rows]
  );

  if (series.length === 0) return <EmptyChart height={height} />;

  return (
    <div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart key={chartKey} data={rows} margin={{ top: 18, right: 12, left: -8, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="key"
              tickFormatter={(k: string) => rows.find((r) => r.key === k)?.label ?? ""}
              tick={{ fontSize: 11, fill: INK_MUTE }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval="preserveStartEnd"
              minTickGap={28}
              padding={bars ? undefined : { left: 14, right: 14 }}
            />
            <YAxis
              domain={domain}
              ticks={ticks}
              tick={{ fontSize: 11, fill: INK_MUTE }}
              tickFormatter={(v: number) => formatValue(v, metric)}
              tickLine={false}
              axisLine={false}
              width={48}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip metric={metric} unit={unit} />}
              cursor={bars ? { fill: "rgba(11,15,26,0.04)" } : { stroke: "rgba(11,15,26,0.2)", strokeDasharray: "3 3" }}
            />
            {bars ? (
              <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={30} animationDuration={700}>
                {rows.map((r) => (
                  <Cell key={r.key} fill={r.record ? "var(--gold)" : r.deload ? DELOAD : "var(--signal)"} />
                ))}
                <LabelList content={deloadLabel} />
              </Bar>
            ) : (
              <>
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--signal)"
                  strokeWidth={1.5}
                  connectNulls
                  animationDuration={900}
                  animationEasing="ease-out"
                  dot={renderDot}
                  activeDot={{ r: 4, fill: "var(--signal)", stroke: "var(--bone)", strokeWidth: 1.5 }}
                />
                <Line
                  type="linear"
                  dataKey="proj"
                  stroke="var(--signal)"
                  strokeWidth={1.5}
                  strokeDasharray="3 4"
                  strokeOpacity={0.6}
                  connectNulls
                  animationBegin={700}
                  animationDuration={400}
                  dot={renderGhost}
                  activeDot={false}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {legend && (
        <div className="mt-3">
          <ChartLegend deload={series.some((p) => p.deload)} target={hasGhost} best={series.some((p) => p.best)} loaded={loaded} />
        </div>
      )}
    </div>
  );
});

function EmptyChart({ height }: { height: number }) {
  return (
    <div style={{ height }} className="relative w-full">
      <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {[40, 90, 140, 190].map((y) => (
          <line key={y} x1="0" x2="400" y1={y} y2={y} stroke={GRID} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-semibold tracking-tight text-ink">No sessions yet</p>
        <p className="mt-1 max-w-xs text-sm text-ink-mute">Your first logged set puts the first point here. Every session after adds one.</p>
      </div>
    </div>
  );
}
