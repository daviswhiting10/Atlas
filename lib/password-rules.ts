/**
 * Password rules shared by the server and the forms (no Node imports here).
 *
 * Following NIST SP 800-63B: a minimum length, a long maximum, no "must
 * include a symbol" rules, spaces and pasting allowed, and a refusal of
 * passwords that are common or easy to guess. Existing shorter passwords
 * keep working; these rules apply when a password is set.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/**
 * Common passwords long enough to pass the length rule. A short curated list
 * plus the pattern checks below; a full breach list could replace it later.
 */
const COMMON = new Set([
  "1234567890", "0987654321", "12345678910", "123456789a", "a123456789", "1234567890a", "123123123123", "1111111111", "0000000000",
  "qwertyuiop", "qwerty1234", "qwerty12345", "qwerty123456", "1q2w3e4r5t", "1q2w3e4r5t6y", "q1w2e3r4t5", "q1w2e3r4t5y6", "1qaz2wsx3edc",
  "zaq12wsxcde", "asdfghjkl1", "asdfghjkl;", "zxcvbnm123", "abcdefghij", "abcd123456", "abc1234567", "aaaaaaaaaa",
  "password12", "password123", "password1234", "password!!", "passw0rd123", "p@ssw0rd123", "p@ssword123", "password01", "mypassword",
  "iloveyou12", "iloveyou123", "letmein123", "welcome123", "welcome1234", "changeme123", "whatever123", "trustno1234",
  "football123", "baseball123", "basketball", "basketball1", "sunshine123", "princess123", "dragon1234", "monkey1234",
  "master1234", "superman123", "batman1234", "starwars123", "michael123", "jennifer123", "computer123", "internet123",
  "atlas12345", "atlas123456", "fitness123", "workout123", "training123", "gymrat1234",
]);

const SEQUENCES = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** True when the whole thing is one character repeated, or a run along a sequence or keyboard row. */
function isPattern(p: string): boolean {
  if (/^(.)\1+$/.test(p)) return true;
  const runOf = (s: string) => s.includes(p) || s.split("").reverse().join("").includes(p);
  return SEQUENCES.some(runOf);
}

/** Why a new password isn't acceptable, or null if it is. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return "That password is too long.";
  const lower = password.toLowerCase();
  const squashed = lower.replace(/\s+/g, "");
  if (COMMON.has(squashed) || isPattern(squashed)) return "That password is too common. Try a few words that mean something to you.";
  const name = email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (name.length >= 4 && squashed.replace(/[^a-z0-9]/g, "").includes(name)) return "Don't use your email address in your password.";
  return null;
}
