"use client";

import { memo, useCallback, useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import type { FocusMetric } from "@/lib/plan/generator";
import { METRICS, formatValue, targetValue, type SessionPoint, type Target } from "@/lib/plan/overload";

type Row = { key: string; label: string; date: string | null; value: number | null; proj: number | null; pr: boolean; ghost: boolean };

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
    <div className="rounded-xl border border-line bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] text-ink-mute">{row.ghost ? "Next target" : row.date ? format(parseISO(row.date), "EEE, MMM d") : ""}</p>
      <p className="tnum text-sm font-semibold text-ink">
        {formatValue(v, metric)} <span className="font-normal text-ink-mute">{unit}</span>
        {row.pr && <span className="ml-2 rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold">PR</span>}
      </p>
    </div>
  );
}

function Dot(props: { cx?: number; cy?: number; payload?: Row; index?: number; last: number }) {
  const { cx, cy, payload, index, last } = props;
  if (cx == null || cy == null || !payload || payload.value == null) return null;
  if (payload.pr) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={8} fill="var(--gold)" opacity={0.18} />
        <circle cx={cx} cy={cy} r={4} fill="var(--gold)" stroke="#fff" strokeWidth={1.5} />
      </g>
    );
  }
  const isLast = index === last;
  return <circle cx={cx} cy={cy} r={isLast ? 4 : 2.5} fill={isLast ? "var(--blue)" : "#fff"} stroke="var(--blue)" strokeWidth={1.5} />;
}

function GhostDot(props: { cx?: number; cy?: number; payload?: Row }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload?.ghost) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="var(--blue)" opacity={0.1} />
      <circle cx={cx} cy={cy} r={4} fill="#fff" stroke="var(--blue)" strokeWidth={1.5} strokeDasharray="2 2" />
    </g>
  );
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
}: {
  series: SessionPoint[];
  metric: FocusMetric;
  loaded: boolean;
  target?: Target | null;
  height?: number;
  /** Change this to replay the draw-in animation (e.g. when switching exercise). */
  chartKey?: string;
}) {
  const unit = METRICS[metric].unit(loaded);

  const { rows, domain, ticks, lastReal } = useMemo(() => {
    const rows: Row[] = series.map((p, i) => ({
      key: `${p.date}-${i}`,
      label: format(parseISO(p.date), "MMM d"),
      date: p.date,
      value: p[metric] ?? null,
      proj: null,
      pr: !!p.pr[metric],
      ghost: false,
    }));
    const lastReal = rows.length - 1;
    const ghost = targetValue(target, metric);
    if (ghost != null && rows.length > 0 && rows[lastReal].value != null) {
      rows[lastReal].proj = rows[lastReal].value;
      rows.push({ key: "next", label: "Next", date: null, value: null, proj: ghost, pr: false, ghost: true });
    }
    const values = rows.flatMap((r) => [r.value, r.proj]).filter((v): v is number => v != null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Round the axis to friendly steps (5, 10, 25, 500…) with a little headroom.
    const span = Math.max(max - min, max * 0.06, 2);
    const raw = span / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw);
    const lo = Math.max(0, Math.floor((min - step * 0.4) / step) * step);
    const hi = Math.ceil((max + step * 0.3) / step) * step;
    const ticks: number[] = [];
    for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
    return { rows, domain: [lo, hi] as [number, number], ticks, lastReal };
  }, [series, metric, target]);

  const renderDot = useCallback(
    (p: object) => <Dot {...(p as object)} last={lastReal} key={(p as { index: number }).index} />,
    [lastReal]
  );
  const renderGhost = useCallback((p: object) => <GhostDot {...(p as object)} key={(p as { index: number }).index} />, []);

  if (series.length === 0) return <EmptyChart height={height} />;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart key={chartKey} data={rows} margin={{ top: 16, right: 16, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="atlas-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--blue)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(11,15,26,0.06)" />
          <XAxis
            dataKey="key"
            tickFormatter={(k: string) => rows.find((r) => r.key === k)?.label ?? ""}
            tick={{ fontSize: 11, fill: "var(--ink-mute)" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
            padding={{ left: 12, right: 12 }}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            tick={{ fontSize: 11, fill: "var(--ink-mute)" }}
            tickFormatter={(v: number) => formatValue(v, metric)}
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
          />
          <Tooltip
            content={<ChartTooltip metric={metric} unit={unit} />}
            cursor={{ stroke: "rgba(11,15,26,0.18)", strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--blue)"
            strokeWidth={2.5}
            fill="url(#atlas-area)"
            connectNulls
            animationDuration={1400}
            animationEasing="ease-out"
            dot={renderDot}
            activeDot={{ r: 5, fill: "var(--blue)", stroke: "#fff", strokeWidth: 2 }}
          />
          <Line
            type="linear"
            dataKey="proj"
            stroke="var(--blue)"
            strokeWidth={2}
            strokeDasharray="4 5"
            strokeOpacity={0.55}
            connectNulls
            animationBegin={1100}
            animationDuration={600}
            dot={renderGhost}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});

function EmptyChart({ height }: { height: number }) {
  return (
    <div style={{ height }} className="relative w-full overflow-hidden rounded-2xl">
      <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {[40, 90, 140].map((y) => (
          <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="rgba(11,15,26,0.06)" />
        ))}
        <path
          d="M10 165 C 70 160, 90 140, 140 132 S 220 104, 260 92 S 340 52, 390 34"
          fill="none"
          stroke="var(--blue)"
          strokeOpacity="0.35"
          strokeWidth="2.5"
          strokeDasharray="5 7"
          strokeLinecap="round"
        />
        <circle cx="10" cy="165" r="5" fill="#fff" stroke="var(--blue)" strokeWidth="2" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
        <div className="rounded-2xl bg-white/85 px-5 py-3 backdrop-blur-sm">
        <p className="font-display text-2xl text-ink">Your first point goes here</p>
        <p className="mt-1 max-w-xs text-sm text-ink-mute">
          Log a set and this chart starts drawing itself. Every session adds a point.
        </p>
        </div>
      </div>
    </div>
  );
}

/** Tiny inline trend line. */
export function Sparkline({
  values,
  width = 96,
  height = 32,
  color = "var(--blue)",
  animate = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  animate?: boolean;
}) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1="2" x2={width - 2} y1={height / 2} y2={height / 2} stroke={color} strokeOpacity="0.3" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = 3 + (i / (values.length - 1)) * (width - 6);
    const y = height - 4 - ((v - min) / span) * (height - 8);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={animate ? "draw" : undefined} />
      <circle cx={lx} cy={ly} r="3" fill={color} />
    </svg>
  );
}
