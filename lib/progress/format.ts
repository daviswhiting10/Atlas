/** An estimated max reads as whole pounds ("187 lb e1RM"); anything else keeps at most one decimal. */
export function shownValue(value: number, unit: string | null): number {
  return unit?.includes("e1RM") ? Math.round(value) : Math.round(value * 10) / 10;
}
