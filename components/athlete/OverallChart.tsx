"use client";

import { memo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import type { OverallPoint } from "@/lib/progress/overall";

const GRID = "rgba(11,15,26,0.07)";
const INK_MUTE = "var(--ink-mute)";
const day = (iso: string) => format(parseISO(iso), "MMM d");
const signed = (n: number) => `${n > 0 ? "+" : ""}${Number.isInteger(n) ? n : n.toFixed(1)}%`;

function Tip({ active, payload }: { active?: boolean; payload?: Array<{ payload: OverallPoint }> }) {
  const row = active ? payload?.[0]?.payload : null;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 shadow-md">
      <p className="text-[11px] text-ink-mute">Week of {day(row.week)}</p>
      <p className="text-sm font-semibold text-ink">{signed(row.pct)}</p>
      <p className="text-xs text-ink-mute">
        across {row.lifts} exercise{row.lifts === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Average change from each lift's start, week by week. */
export const OverallChart = memo(function OverallChart({ points, height = 260 }: { points: OverallPoint[]; height?: number }) {
  const values = points.map((p) => p.pct);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = Math.max(2, (hi - lo) * 0.15);
  const domain: [number, number] = [Math.floor((lo - (lo < 0 ? pad : 0)) / 5) * 5, Math.ceil((hi + pad) / 5) * 5];

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="overall-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--signal)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--signal)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="week" tickFormatter={day} tick={{ fontSize: 11, fill: INK_MUTE }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={28} padding={{ left: 12, right: 12 }} />
          <YAxis domain={domain} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`} tick={{ fontSize: 11, fill: INK_MUTE }} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
          <ReferenceLine y={0} stroke="rgba(11,15,26,0.18)" />
          <Tooltip content={<Tip />} cursor={{ stroke: "rgba(11,15,26,0.2)", strokeDasharray: "3 3" }} />
          <Area
            type="monotone"
            dataKey="pct"
            stroke="var(--signal)"
            strokeWidth={2}
            fill="url(#overall-fill)"
            animationDuration={900}
            animationEasing="ease-out"
            dot={{ r: 2.5, fill: "var(--signal)", strokeWidth: 0 }}
            activeDot={{ r: 4, fill: "var(--signal)", stroke: "var(--bone)", strokeWidth: 1.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
