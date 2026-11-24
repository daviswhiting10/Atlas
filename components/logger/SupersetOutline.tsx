/**
 * While a superset member is lifted: the group's outline, where the group was. Whole (solid) while the finger is inside it,
 * open (dashed, faded) once the finger has left it, which says "let go here and it comes out of the superset".
 * Drawn behind the cards; moves nothing.
 */
export function SupersetOutline({ box }: { box: { top: number; height: number; broken: boolean } | null }) {
  if (!box) return null;
  return (
    <div
      aria-hidden
      data-superset-outline={box.broken ? "broken" : "whole"}
      className="pointer-events-none absolute -left-2 -right-2 !mt-0 z-10 rounded-[20px] border-2 transition-[opacity,border-color] duration-150"
      style={{ top: box.top, height: box.height, borderColor: "var(--dusk-teal)", borderStyle: box.broken ? "dashed" : "solid", opacity: box.broken ? 0.4 : 1 }}
    >
      <span className="absolute -top-3 right-4 rounded-full bg-bone px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
        {box.broken ? "Drop to ungroup" : "Superset"}
      </span>
    </div>
  );
}
