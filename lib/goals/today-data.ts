import { cache } from "react";
import { activeGoalId, loadGoal } from "./data";

/**
 * The running goal for Today, cached for one request so the page can start
 * loading it early (alongside the plan) and the goal card reuses the same
 * calls instead of starting them after the plan has loaded.
 */
export const todayGoalId = cache((clientId: string) => activeGoalId(clientId));
export const todayGoal = cache((goalId: string, clientId: string) => loadGoal(goalId, clientId));

/** Start loading the running goal now; the card picks up the same promises. */
export function preloadTodayGoal(clientId: string): void {
  void todayGoalId(clientId)
    .then((id) => (id ? todayGoal(id, clientId) : null))
    .catch(() => {
      // The card makes the same calls and handles the error there.
    });
}
