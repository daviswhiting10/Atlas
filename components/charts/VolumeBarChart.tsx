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

export type VolumePoint = {
  weekStart: string;
  totalKg: number;
  sessionCount: number;
};

type Props = {
  data: VolumePoint[];
  color?: string;
  height?: number;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: VolumePoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-muted-foreground mb-1">
        {label ? `Week of ${format(new Date(label + "T00:00:00"), "MMM d")}` : ""}
      </p>
      <p className="font-semibold text-foreground">
        {(point.totalKg / 1000).toFixed(1)}k lb total
      </p>
      <p className="text-muted-foreground">
        {point.sessionCount} session{point.sessionCount !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function VolumeBarChart({ data, color = "#6366f1", height = 160 }: Props) {
  if (data.length === 0) return null;

  const maxVol = Math.max(...data.map((d) => d.totalKg));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={12}>
        <XAxis
          dataKey="weekStart"
          tickFormatter={(d: string) => format(new Date(d + "T00:00:00"), "MMM d")}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          tickCount={8}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
        <Bar dataKey="totalKg" radius={[3, 3, 0, 0]} isAnimationActive={true} animationDuration={600}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={color}
              fillOpacity={0.4 + 0.6 * (entry.totalKg / maxVol)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
