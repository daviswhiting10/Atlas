/**
 * The demo's memory: sets ticked and workouts finished since the demo opened. In this browser tab only (a module
 * variable), never stored, never sent. Reset empties it back to the sample; Exit drops it.
 */

type SetEntry = { weight: number | null; reps: number | null; done: boolean };

const sets = new Map<string, SetEntry>();
const finished = new Set<string>();
const listeners = new Set<() => void>();
const finishListeners = new Set<() => void>();

const key = (workoutId: string, aweId: string, setNumber: number) => `${workoutId}|${aweId}|${setNumber}`;

export const demoStore = {
  setSet(workoutId: string, aweId: string, setNumber: number, entry: SetEntry) {
    sets.set(key(workoutId, aweId, setNumber), entry);
  },
  getSet(workoutId: string, aweId: string, setNumber: number): SetEntry | undefined {
    return sets.get(key(workoutId, aweId, setNumber));
  },
  finish(workoutId: string) {
    finished.add(workoutId);
    // Only Today and Plan listen for this: the logger that just finished keeps its finish screen.
    finishListeners.forEach((l) => l());
  },
  /** The finished workouts' ids as one stable string (a snapshot for useSyncExternalStore). */
  finishedKey() {
    return Array.from(finished).sort().join(",");
  },
  isFinished(workoutId: string) {
    return finished.has(workoutId);
  },
  /** Back to the sample exactly. */
  reset() {
    sets.clear();
    finished.clear();
    listeners.forEach((l) => l());
    finishListeners.forEach((l) => l());
  },
  /** How many changes there are (for tests and the Reset button). */
  size() {
    return sets.size + finished.size;
  },
  /** Tells when a workout was finished, or the demo was reset. */
  subscribeFinished(l: () => void) {
    finishListeners.add(l);
    return () => void finishListeners.delete(l);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};
