"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { format } from "date-fns";

export type E1RMPoint = {
  date: string;
  e1RM: number;
  isPR?: boolean;
};

type Props = {
  data: E1RMPoint[];
  color: string;
  exerciseName?: string;
  height?: number;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-muted-foreground">
        {label ? format(new Date(label + "T00:00:00"), "MMM d, yyyy") : ""}
      </p>
      <p className="font-semibold text-foreground">
        {payload[0].value.toFixed(0)} lb e1RM
      </p>
    </div>
  );
}

export function E1RMLineChart({ data, color, height = 140 }: Props) {
  if (data.length === 0) return null;

  const prPoints = data.filter((d) => d.isPR);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => format(new Date(d + "T00:00:00"), "MMM d")}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          tickCount={5}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(v: number) => `${v}`}
        />
        <Tooltip content={<CustomTooltip />} />

        <Line
          type="monotone"
          dataKey="e1RM"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: "white", strokeWidth: 2 }}
          isAnimationActive={true}
          animationDuration={600}
        />

        {prPoints.map((p) => (
          <ReferenceDot
            key={p.date}
            x={p.date}
            y={p.e1RM}
            r={5}
            fill={color}
            stroke="white"
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
