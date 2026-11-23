/**
 * The NUTRITION feature flag. OFF unless NUTRITION=on is set: with it off, Today and You are exactly what they were,
 * the nutrition pages 404, and the nutrition actions refuse. Read on the server per request, so flipping it is an env change.
 */
export function nutritionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NUTRITION?.trim().toLowerCase() === "on";
}
