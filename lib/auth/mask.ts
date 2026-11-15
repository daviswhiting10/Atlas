/** An email shown without giving it away, for logs and scripts: d***s@a*******.co */
export function maskEmail(address: string): string {
  const [name = "", domain = ""] = address.split("@");
  const dot = domain.lastIndexOf(".");
  const [host, tld] = dot > 0 ? [domain.slice(0, dot), domain.slice(dot)] : [domain, ""];
  const keepEnds = (s: string) => (s.length <= 2 ? (s[0] ?? "") + "*" : s[0] + "*".repeat(s.length - 2) + s.slice(-1));
  const hostMasked = host ? host[0] + "*".repeat(Math.max(1, host.length - 1)) : "";
  return `${keepEnds(name)}@${hostMasked}${tld}`;
}
