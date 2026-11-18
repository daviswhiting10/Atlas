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
 * Accounts created before this day may say "Not now" every time it asks.
 * Newer ones (invited clients) may skip once; the second time they set a password.
 * It's the day this shipped.
 */
export const PASSWORD_REQUIRED_FROM = new Date("2026-11-14T00:00:00Z");

/**
 * The set-password step is on. AUTH_PASSWORD_STEP ("on" / "off") overrides the default either
 * way, as a kill switch.
 */
const STEP_DEFAULT = true;
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

/** May this account say "Not now"? Older accounts always; newer ones only if they haven't already. */
export function mayWait(createdAt: Date, passwordPromptAfter: Date | null): boolean {
  return createdAt < PASSWORD_REQUIRED_FROM || passwordPromptAfter == null;
}

export function passwordStep(u: StepInput, now: Date, enabled: boolean, guestDomain: string): Step {
  const none = { needs: false, canSnooze: false };
  if (!enabled || u.hasPassword || u.googleLinked || u.email.endsWith(`@${guestDomain}`)) return none;
  if (u.passwordPromptAfter && u.passwordPromptAfter > now) return none;
  return { needs: true, canSnooze: mayWait(u.createdAt, u.passwordPromptAfter) };
}

/** A session made before the password last changed is no longer good. Sessions from before this shipped carry no stamp and stay good. */
export function sessionCurrent(tokenStamp: number | undefined, passwordChangedAt: Date | null): boolean {
  return (tokenStamp ?? 0) === (passwordChangedAt?.getTime() ?? 0);
}
