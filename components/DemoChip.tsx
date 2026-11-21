/**
 * Shown on every screen of the demo, coach side and athlete side, so nobody mistakes it for real data.
 * "Demo" on a phone (the header is tight), "Demo data" from tablet width; a screen reader always hears "Demo data".
 */
export function DemoChip() {
  return (
    <span className="shrink-0 rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-medium text-ink-mute">
      Demo<span className="max-sm:sr-only"> data</span>
    </span>
  );
}
