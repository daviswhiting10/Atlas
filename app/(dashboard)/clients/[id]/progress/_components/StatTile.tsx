type Props = {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaPositive?: boolean;
};

export function StatTile({ label, value, sub, delta, deltaPositive }: Props) {
  return (
    <div
      className="rounded-[18px] px-4 py-3 min-w-[120px] snap-start"
      style={{ border: "1px solid var(--line)", background: "var(--paper)" }}
    >
      <p
        className="font-body text-xs font-medium uppercase tracking-wide leading-tight"
        style={{ color: "var(--ink-mute)" }}
      >
        {label}
      </p>
      <p
        className="font-display italic leading-none mt-1"
        style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", color: "var(--ink)" }}
      >
        {value}
      </p>
      {delta && (
        <p
          className="font-body text-xs font-medium mt-1"
          style={{
            color:
              deltaPositive === true
                ? "var(--success)"
                : deltaPositive === false
                ? "var(--destructive)"
                : "var(--ink-mute)",
          }}
        >
          {delta}
        </p>
      )}
      {sub && !delta && (
        <p className="font-body text-xs mt-1 leading-tight" style={{ color: "var(--ink-mute)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}
