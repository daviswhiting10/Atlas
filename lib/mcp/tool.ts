/**
 * One code path for every tool call:
 *
 *   role gate → input validation → client scoping → handler → audit
 *
 * Tools are plain definition objects, so the pipeline can be exercised in
 * tests with fake handlers and a fake audit sink — no MCP transport needed.
 */

import { z } from "zod";
import { authorizeRole, resolveClientScope, type ClientLookup } from "./auth";
import { buildAuditEntry, type AuditSink } from "./audit";
import { McpError, type McpCaller, type McpOutcome, type McpRole, type McpTransport, type ScopedClient } from "./context";

export type ToolContext = { caller: McpCaller; transport: McpTransport };

type Base<S extends z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  /** read = no side effects; write = changes data; generate = spends money, changes nothing. */
  permission: "read" | "write" | "generate";
  roles: readonly McpRole[];
  input: S;
};

/** A tool that acts on one client. The pipeline resolves and scopes the client before the handler runs. */
export type ClientTool<S extends z.ZodObject = z.ZodObject> = Base<S> & {
  scope: "client";
  handler: (ctx: ToolContext & { client: ScopedClient }, args: z.output<S>) => Promise<unknown>;
};

/** A tool scoped to the caller's workspace rather than to one client. */
export type WorkspaceTool<S extends z.ZodObject = z.ZodObject> = Base<S> & {
  scope: "workspace";
  handler: (ctx: ToolContext, args: z.output<S>) => Promise<unknown>;
};

export type ToolDef = ClientTool | WorkspaceTool;

export const clientTool = <S extends z.ZodObject>(def: Omit<ClientTool<S>, "scope">): ToolDef =>
  ({ ...def, scope: "client" }) as unknown as ToolDef;
export const workspaceTool = <S extends z.ZodObject>(def: Omit<WorkspaceTool<S>, "scope">): ToolDef =>
  ({ ...def, scope: "workspace" }) as unknown as ToolDef;

export type ToolDeps = { lookupClient: ClientLookup; audit: AuditSink; transport: McpTransport };

export type ToolResult = { outcome: "ok"; data: unknown } | { outcome: Exclude<McpOutcome, "ok">; message: string };

export async function executeTool(def: ToolDef, caller: McpCaller, rawArgs: unknown, deps: ToolDeps): Promise<ToolResult> {
  const started = Date.now();
  let clientId: string | null = null;
  let result: ToolResult;

  try {
    authorizeRole(caller, def.roles);

    const parsed = def.input.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      throw new McpError("validation_error", z.prettifyError(parsed.error));
    }
    const args = parsed.data as Record<string, unknown>;
    const ctx: ToolContext = { caller, transport: deps.transport };

    let data: unknown;
    if (def.scope === "client") {
      const requested = typeof args.clientId === "string" ? args.clientId : undefined;
      const client = await resolveClientScope(caller, requested, deps.lookupClient);
      clientId = client.id;
      data = await def.handler({ ...ctx, client }, args);
    } else {
      data = await def.handler(ctx, args);
    }
    result = { outcome: "ok", data };
  } catch (err) {
    if (err instanceof McpError) {
      result = { outcome: err.outcome, message: err.message };
    } else {
      // Never echo internals (query text, stack traces) back to an AI client.
      console.error(`[mcp] ${def.name} failed:`, err);
      result = { outcome: "error", message: "The tool failed. Nothing was changed." };
    }
  }

  try {
    await deps.audit(
      buildAuditEntry({
        caller,
        transport: deps.transport,
        tool: def.name,
        clientId,
        args: rawArgs ?? {},
        outcome: result.outcome,
        latencyMs: Date.now() - started,
      })
    );
  } catch (err) {
    // One line, no stack: this can fire on every call if the audit table is unreachable.
    const reason = err instanceof Error ? err.message.trim().split("\n").pop() : String(err);
    console.error(`[mcp] audit write failed for ${def.name}: ${reason}`);
  }

  return result;
}
