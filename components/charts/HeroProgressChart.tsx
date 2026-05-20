"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Dot,
} from "recharts";
import { useState } from "react";
import { format } from "date-fns";

export type HeroDataPoint = {
  date: string; // YYYY-MM-DD
  value: number;
  milestones?: Array<{ title: string; description: string; type: string }>;
};

type Props = {
  data: HeroDataPoint[];
  label: string; // "Body Weight (kg)" | "Strength Composite (%)" | etc.
  unit: string;  // "kg" | "%" | "lb"
  color: string; // Tailwind CSS hex color string, e.g. "#10b981"
  goalValue?: number | null;
  goalLabel?: string;
  animationDuration?: number;
  formatY?: (v: number) => string;
};

type MilestoneDotProps = {
  cx?: number;
  cy?: number;
  payload?: HeroDataPoint;
  color: string;
};

function MilestoneDotRenderer({ cx, cy, payload, color }: MilestoneDotProps) {
  const [hovered, setHovered] = useState(false);
  if (!payload?.milestones?.length || cx == null || cy == null) return null;

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={hovered ? 7 : 5}
        fill={color}
        stroke="white"
        strokeWidth={2}
        style={{ cursor: "pointer", transition: "r 150ms" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {hovered && (
        <foreignObject
          x={cx - 80}
          y={cy - 72}
          width={160}
          height={64}
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div
            style={{ fontFamily: "inherit" }}
            className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs"
          >
            <p className="font-semibold text-foreground leading-tight">
              {payload.milestones[0].title}
            </p>
            <p className="text-muted-foreground mt-0.5 leading-tight">
              {payload.milestones[0].description}
            </p>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  unit,
  formatY,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit: string;
  formatY?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const display = formatY ? formatY(value) : `${value} ${unit}`;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-muted-foreground">
        {label ? format(new Date(label + "T00:00:00"), "MMM d, yyyy") : ""}
      </p>
      <p className="font-semibold text-foreground text-sm mt-0.5">{display}</p>
    </div>
  );
}

export function HeroProgressChart({
  data,
  label,
  unit,
  color,
  goalValue,
  goalLabel,
  animationDuration = 800,
  formatY,
}: Props) {
  if (data.length === 0) return null;

  const gradientId = `hero-gradient-${label.replace(/\s/g, "")}`;

  // Format x-axis ticks based on date range
  const daySpan =
    data.length > 1
      ? (new Date(data[data.length - 1].date).getTime() - new Date(data[0].date).getTime()) /
        86400000
      : 0;

  const xTickFormatter = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    if (daySpan < 45) return format(d, "MMM d");
    if (daySpan < 200) return format(d, "MMM d");
    return format(d, "MMM ''yy");
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="date"
          tickFormatter={xTickFormatter}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          tickCount={6}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatY ?? ((v) => `${v}`)}
          width={48}
        />

        <Tooltip
          content={<CustomTooltip unit={unit} formatY={formatY} />}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 2", opacity: 0.5 }}
        />

        {goalValue != null && (
          <ReferenceLine
            y={goalValue}
            stroke={color}
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: goalLabel ?? `Goal: ${goalValue} ${unit}`,
              position: "right",
              fontSize: 10,
              fill: color,
            }}
          />
        )}

        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={3}
          fill={`url(#${gradientId})`}
          dot={<MilestoneDotRenderer color={color} />}
          activeDot={{ r: 5, fill: color, stroke: "white", strokeWidth: 2 }}
          isAnimationActive={true}
          animationDuration={animationDuration}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
