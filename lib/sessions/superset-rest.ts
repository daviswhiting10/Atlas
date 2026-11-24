/**
 * Rest in a superset (3A and 3B): one timer for the pair, and it starts only when BOTH have that set logged, not one after each.
 * A single exercise (not in a superset) rests after each set as ever. Pure: no I/O.
 */

/** Should the rest timer start after `aweId`'s set `setNumber` was logged? `loggedSets(id)`: the set numbers logged on an exercise; `numbers(id)`: all its set numbers. */
export function restDue(group: string[], aweId: string, setNumber: number, loggedSets: (id: string) => ReadonlySet<number>, numbers: (id: string) => ReadonlySet<number>): boolean {
  const partners = group.filter((id) => id !== aweId);
  if (partners.length === 0) return true;
  // A partner with fewer sets (no set N at all) isn't waited for.
  return partners.every((id) => !numbers(id).has(setNumber) || loggedSets(id).has(setNumber));
}

/** The rest for the pair: the longest of its members' own rests. */
export const pairRest = (rests: number[]): number => Math.max(...rests, 0);
