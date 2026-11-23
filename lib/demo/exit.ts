/** Where Exit goes: the page the demo was opened from, when it is a path on this site (and not the demo); else home. */
export function exitTo(from: string | null | undefined): string {
  if (!from || typeof from !== "string") return "/";
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\") || /^\/demo(\/|\?|$)/.test(from)) return "/";
  try {
    const u = new URL(from, "https://atlas.invalid");
    if (u.origin !== "https://atlas.invalid") return "/";
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}
