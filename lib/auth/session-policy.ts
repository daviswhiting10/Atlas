/**
 * Who has to set a password, and whether a session is still good. Pure.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Signed in for 180 days, extended whenever the app is used (re-issued at most once a day). */
export const SESSION_MAX_AGE_S = 180 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_S = 24 * 60 * 60;
/** How often a session re-checks the database (password changed, password still missing). */
export const RECHECK_MS = 10 * 60 * 1000;
/** "Not now" on the set-password step. */
export const SNOOZE_MS = 7 * DAY;

/**
 * Accounts created from this moment must set a password straight away;
 * older ones may say "Not now". It's the day this shipped.
 */
export const PASSWORD_REQUIRED_FROM = new Date("2026-11-14T00:00:00Z");

/**
 * The set-password step is off until the second deploy. AUTH_PASSWORD_STEP
 * ("on" / "off") overrides the default either way, as a kill switch.
 */
const STEP_DEFAULT = false;
export function passwordStepEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.AUTH_PASSWORD_STEP?.toLowerCase();
  return v === "on" ? true : v === "off" ? false : STEP_DEFAULT;
}

export type StepInput = {
  email: string;
  hasPassword: boolean;
  createdAt: Date;
  passwordPromptAfter: Date | null;
  /** Signs in with Google: offered a password, never forced. */
  googleLinked: boolean;
};

export type Step = { needs: boolean; canSnooze: boolean };

export function passwordStep(u: StepInput, now: Date, enabled: boolean, guestDomain: string): Step {
  const none = { needs: false, canSnooze: false };
  if (!enabled || u.hasPassword || u.googleLinked || u.email.endsWith(`@${guestDomain}`)) return none;
  const canSnooze = u.createdAt < PASSWORD_REQUIRED_FROM;
  if (canSnooze && u.passwordPromptAfter && u.passwordPromptAfter > now) return none;
  return { needs: true, canSnooze };
}

/** A session made before the password last changed is no longer good. Sessions from before this shipped carry no stamp and stay good. */
export function sessionCurrent(tokenStamp: number | undefined, passwordChangedAt: Date | null): boolean {
  return (tokenStamp ?? 0) === (passwordChangedAt?.getTime() ?? 0);
}
