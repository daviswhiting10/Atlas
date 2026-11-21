/**
 * Obvious typos at the end of an email address ("icloud.con", "gmial.com"). Only ever a suggestion: the person
 * may really mean what they typed. Pure.
 */

/** Well-known mail domains, and the misspellings of them that are common enough to be worth a nudge. */
const DOMAINS: Record<string, string[]> = {
  "gmail.com": ["gmial.com", "gmal.com", "gmai.com", "gnail.com", "gamil.com", "gmaill.com", "gmail.co"],
  "icloud.com": ["iclod.com", "icoud.com", "icloud.co", "iclould.com", "icluod.com"],
  "hotmail.com": ["hotmial.com", "hotmal.com", "hotmai.com", "hotmail.co"],
  "yahoo.com": ["yaho.com", "yahooo.com", "yahoo.co"],
  "outlook.com": ["outlok.com", "outloo.com", "outlook.co"],
  "me.com": [],
  "aol.com": [],
};
const FIXED: Record<string, string> = Object.fromEntries(Object.entries(DOMAINS).flatMap(([right, wrongs]) => wrongs.map((w) => [w, right])));

/** Endings that are almost always a slip for ".com" or ".net" (".con", ".cmo", ".comm", ".ocm", ".vom", ".xom", ".nte", ".ent"). */
const ENDINGS: Array<[RegExp, string]> = [
  [/\.(con|cmo|comm|ocm|vom|xom|cpm|coom|cim)$/, ".com"],
  [/\.(nte|ent|met)$/, ".net"],
];

/** The address the person probably meant, or null if nothing looks wrong. */
export function emailTypo(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  let domain = email.slice(at + 1);
  for (const [re, to] of ENDINGS) if (re.test(domain)) domain = domain.replace(re, to);
  domain = FIXED[domain] ?? domain;
  const fixed = `${local}@${domain}`;
  return fixed === email ? null : fixed;
}
