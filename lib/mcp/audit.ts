/**
 * Audit trail for MCP calls. Every call is recorded — reads, writes and
 * refusals — with who, what, on whom, and how it ended. Arguments are stored
 * as a hash only.
 */

import { createHash } from "crypto";
import type { McpCaller, McpOutcome, McpTransport } from "./context";

export type AuditEntry = {
  workspaceId: string;
  actorUserId: string;
  actorRole: McpCaller["role"];
  transport: McpTransport;
  tool: string;
  clientId: string | null;
  argsHash: string;
  outcome: McpOutcome;
  latencyMs: number;
};

export type AuditSink = (entry: AuditEntry) => Promise<void>;

/** JSON with object keys sorted, so the same arguments always hash the same. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function hashArgs(args: unknown): string {
  return createHash("sha256").update(stableStringify(args)).digest("hex");
}

export function buildAuditEntry(input: {
  caller: McpCaller;
  transport: McpTransport;
  tool: string;
  clientId: string | null;
  args: unknown;
  outcome: McpOutcome;
  latencyMs: number;
}): AuditEntry {
  return {
    workspaceId: input.caller.workspaceId,
    actorUserId: input.caller.userId,
    actorRole: input.caller.role,
    transport: input.transport,
    tool: input.tool,
    clientId: input.clientId,
    argsHash: hashArgs(input.args),
    outcome: input.outcome,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
  };
}
