/**
 * Password rules shared by the server and the forms (no Node imports here).
 *
 * Two tiers:
 *   refused:  under 10 characters (or over 200, the hashing limit). Nothing else is ever refused.
 *   warned:   looks easy to guess (one of the most common passwords, a common word, a simple pattern, all one kind
 *             of character): the person sees "This looks easy to guess" and can press "Use it anyway";
 *   anything else is fine. No "must contain a symbol", and nothing about the email.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/**
 * The most common passwords of all, from the public top-100 lists (lowercase, spaces removed). Warned about, like
 * the other easy-to-guess ones (the person's account, the person's call).
 * Those under 10 characters are already refused by the length rule; the ones that matter here are the 10+ ones
 * ("1234567890", "qwertyuiop", "password123", ...).
 */
const WORST = new Set([
  "123456", "password", "12345678", "qwerty", "123456789", "12345", "1234", "111111", "1234567", "dragon", "123123", "baseball", "abc123", "football",
  "monkey", "letmein", "696969", "shadow", "master", "666666", "qwertyuiop", "123321", "mustang", "1234567890", "michael", "654321", "superman", "1qaz2wsx",
  "7777777", "121212", "000000", "qazwsx", "123qwe", "killer", "trustno1", "jordan", "jennifer", "zxcvbnm", "asdfgh", "hunter", "buster", "soccer", "harley",
  "batman", "andrew", "tigger", "sunshine", "iloveyou", "2000", "charlie", "robert", "thomas", "hockey", "ranger", "daniel", "starwars", "klaster", "112233",
  "george", "computer", "michelle", "jessica", "pepper", "1111", "zxcvbn", "555555", "11111111", "131313", "freedom", "777777", "pass", "maggie", "159753",
  "aaaaaa", "ginger", "princess", "joshua", "cheese", "amanda", "summer", "love", "ashley", "nicole", "chelsea", "biteme", "matthew", "access", "yankees",
  "987654321", "dallas", "austin", "thunder", "taylor", "matrix", "password1", "qwerty123", "1q2w3e4r", "welcome", "admin", "password123", "1q2w3e4r5t",
  "0987654321", "123456789a", "1234567891", "12345678910", "qwertyuiop1", "iloveyou1", "abcdefghij", "1111111111", "0000000000",
]);

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

/** What counts as the same password for the lists: any case, no spaces. */
const squash = (p: string) => p.toLowerCase().replace(/\s+/g, "");

/**
 * The only reason a password is refused: its length (under the minimum, or over the hashing limit). Nothing else
 * stops a person choosing their own password.
 */
export function passwordBlock(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return "That password is too long.";
  return null;
}

/** Digits only, or letters of one case only, with no spaces: the kind of password that is guessed first. */
function oneKindOfCharacter(p: string): boolean {
  return /^[0-9]+$/.test(p) || /^[a-z]+$/.test(p) || /^[A-Z]+$/.test(p);
}

/**
 * A gentle "this looks easy to guess", or null. It only WARNS: the person may use the password anyway.
 * Common words, simple patterns (a repeated character, a run, a keyboard row) and all one kind of character.
 */
export function passwordWarning(password: string): string | null {
  const squashed = squash(password);
  if (WORST.has(squashed) || COMMON.has(squashed) || isPattern(squashed) || oneKindOfCharacter(password)) return "This looks easy to guess.";
  return null;
}
