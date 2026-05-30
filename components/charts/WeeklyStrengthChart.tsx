"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { format } from "date-fns";

export type WeeklyStrengthPoint = {
  weekStart: string;
  pctChange: number;
  liftCount: number;
};

export function WeeklyStrengthChart({
  data,
  color = "var(--blue)",
}: {
  data: WeeklyStrengthPoint[];
  color?: string;
}) {
  if (data.length === 0) return null;
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pctChange)), 1);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        barSize={12}
      >
        <XAxis
          dataKey="weekStart"
          tickFormatter={(d: string) =>
            format(new Date(d + "T00:00:00"), "MMM d")
          }
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={32}
          tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.3 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const pt = payload[0].payload as WeeklyStrengthPoint;
            return (
              <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
                <p className="text-muted-foreground mb-1">
                  {label
                    ? `Week of ${format(new Date(label + "T00:00:00"), "MMM d")}`
                    : ""}
                </p>
                <p className="font-semibold text-foreground">
                  {pt.pctChange > 0 ? "+" : ""}
                  {pt.pctChange.toFixed(1)}% vs baseline
                </p>
                <p className="text-muted-foreground">
                  {pt.liftCount} lift{pt.liftCount !== 1 ? "s" : ""} tracked
                </p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="pctChange"
          radius={[3, 3, 0, 0]}
          isAnimationActive
          animationDuration={600}
        >
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.pctChange >= 0 ? color : "var(--destructive)"}
              fillOpacity={0.4 + 0.6 * (Math.abs(entry.pctChange) / maxAbs)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
