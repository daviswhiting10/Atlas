/** Bars, one per week, the latest in the accent. Purely a picture: the number beside it carries the meaning. */
export function Sparkline({ values, height = 64, label }: { values: number[]; height?: number; label: string }) {
  const max = Math.max(1, ...values);
  const gap = 6;
  const w = 100;
  const bw = (w - (gap * (values.length - 1)) / 3.9) / values.length;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = v === 0 ? 2 : Math.max(4, (v / max) * height);
        return (
          <rect
            key={i}
            x={i * (bw + gap / 3.9)}
            y={height - h}
            width={bw}
            height={h}
            rx={1.2}
            className={i === values.length - 1 ? "fill-signal" : "fill-ink/20"}
          />
        );
      })}
    </svg>
  );
}
