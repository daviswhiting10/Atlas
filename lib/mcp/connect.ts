import { MCP_ENDPOINT_PATH } from "@/lib/mcp/token-shared";

/** One shell word in single quotes: safe for any token or URL (a ' becomes '\''). */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The MCP endpoint on this site: the origin (no trailing slash) plus MCP_ENDPOINT_PATH. */
export function mcpUrl(origin: string): string {
  return origin.replace(/\/+$/, "") + MCP_ENDPOINT_PATH;
}

/**
 * The Claude Code command that adds Atlas as an HTTP MCP server named "atlas", for every project on that
 * computer (user scope). Syntax checked against `claude mcp add --help`.
 */
export function claudeCodeCommand(origin: string, token: string): string {
  return `claude mcp add --transport http --scope user atlas ${shellQuote(mcpUrl(origin))} --header ${shellQuote(`Authorization: Bearer ${token}`)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 27", or "Nov 27, 2025" outside the current year. Local time. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day}, ${d.getFullYear()}`;
}

/** The one grey line under a token's name. */
export function tokenLine(t: { createdAt: string; lastUsedAt: string | null; revokedAt: string | null }, now: Date = new Date()): string {
  if (t.revokedAt) return `Revoked ${shortDate(t.revokedAt, now)}`;
  const used = t.lastUsedAt ? `Last used ${shortDate(t.lastUsedAt, now)}` : "Never used";
  return `Created ${shortDate(t.createdAt, now)} · ${used}`;
}
