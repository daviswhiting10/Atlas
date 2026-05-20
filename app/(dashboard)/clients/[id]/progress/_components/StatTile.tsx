import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  sub?: string;
  delta?: string; // e.g. "+12.4%", "-2.1 kg"
  deltaPositive?: boolean; // true = green, false = red, undefined = neutral
};

export function StatTile({ label, value, sub, delta, deltaPositive }: Props) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 min-w-[120px] snap-start">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide leading-tight">
        {label}
      </p>
      <p className="text-3xl font-bold tracking-tight mt-1 leading-none">{value}</p>
      {delta && (
        <p
          className={cn(
            "text-xs font-medium mt-1",
            deltaPositive === true
              ? "text-emerald-600"
              : deltaPositive === false
              ? "text-red-500"
              : "text-muted-foreground"
          )}
        >
          {delta}
        </p>
      )}
      {sub && !delta && (
        <p className="text-xs text-muted-foreground mt-1 leading-tight">{sub}</p>
      )}
    </div>
  );
}
