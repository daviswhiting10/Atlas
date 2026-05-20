"use client";

import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

export type WeightPoint = {
  date: string;
  weightKg: number;
  ema: number;
};

type Props = {
  data: WeightPoint[];
  color?: string;
  height?: number;
  goalKg?: number | null;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const emaPoint = payload.find((p) => p.name === "ema");
  const rawPoint = payload.find((p) => p.name === "weightKg");
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-muted-foreground mb-1">
        {label ? format(new Date(label + "T00:00:00"), "MMM d, yyyy") : ""}
      </p>
      {rawPoint && (
        <p className="text-muted-foreground">Raw: {rawPoint.value.toFixed(1)} kg</p>
      )}
      {emaPoint && (
        <p className="font-semibold text-foreground">Trend: {emaPoint.value.toFixed(1)} kg</p>
      )}
    </div>
  );
}

export function WeightTrendChart({ data, color = "#10b981", height = 200 }: Props) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => format(new Date(d + "T00:00:00"), "MMM d")}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          tickCount={6}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={42}
          tickFormatter={(v: number) => `${v}`}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<CustomTooltip />} />

        {/* Raw daily dots */}
        <Scatter dataKey="weightKg" fill={color} fillOpacity={0.25} r={3} />

        {/* EMA trend line — the signal */}
        <Line
          type="monotone"
          dataKey="ema"
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: "white", strokeWidth: 2 }}
          isAnimationActive={true}
          animationDuration={800}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
