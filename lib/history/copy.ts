/**
 * Words for the history views. Plain and neutral (docs/archive-and-chapters.md,
 * "Copy rules"): past tense and plain numbers, no exclamation marks, and never
 * "missed", "lost", "broke", "behind", "failed" or "only".
 *
 * Pure: no I/O.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "March" for "2026-03-14" or "2026-03". */
export const monthName = (day: string): string => MONTHS[Number(day.slice(5, 7)) - 1];

/** "March 3" for "2026-03-03". */
export const shortDate = (day: string): string => `${monthName(day)} ${Number(day.slice(8, 10))}`;

/** "four" for 4; digits above twelve. */
export const numberWord = (n: number): string => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "25th", "101st". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** "225" or "227.5": a weight without trailing zeros. */
export const lb = (n: number): string => String(Math.round(n * 10) / 10);

/** "1 session", "4 sessions". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
