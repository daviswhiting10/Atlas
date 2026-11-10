/**
 * Who is calling. Resolved once per MCP session and bound into every tool
 * handler by closure — it is never read from tool arguments, so a client
 * cannot widen its own access by passing a different workspace or client id.
 */

export type McpRole = "TRAINER" | "CLIENT" | "ADMIN";

export type McpCaller = {
  userId: string;
  role: McpRole;
  workspaceId: string;
  /** Set only for CLIENT callers: the one profile they may act on. */
  clientProfileId: string | null;
};

export type McpTransport = "http" | "stdio";

export type McpOutcome = "ok" | "validation_error" | "forbidden" | "not_found" | "rate_limited" | "error";

/** A refusal with a known cause. Anything else thrown by a handler is reported as a generic "error". */
export class McpError extends Error {
  constructor(
    public readonly outcome: Exclude<McpOutcome, "ok" | "error">,
    message: string
  ) {
    super(message);
    this.name = "McpError";
  }
}

export const forbidden = (message = "This tool is not available to your role.") => new McpError("forbidden", message);
/** Used for every cross-scope lookup: "not found" never confirms that a record exists somewhere else. */
export const notFound = (message = "Not found.") => new McpError("not_found", message);
export const invalid = (message: string) => new McpError("validation_error", message);
export const rateLimited = (message: string) => new McpError("rate_limited", message);

/** The client a call acts on, after scoping. */
export type ScopedClient = {
  id: string;
  workspaceId: string;
  fullName: string;
  primaryGoal: string | null;
  keyLiftIds: string[];
  /** True when the athlete generated their own plan (lighter weeks follow the generator's rule). */
  selfServe: boolean;
};
