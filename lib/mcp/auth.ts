/**
 * Authorization for MCP calls — pure, no I/O, so the whole role × scope
 * matrix is unit-tested without a database.
 *
 * Two different refusals, on purpose:
 *  - 403 (forbidden) when the caller's ROLE may not use the tool at all.
 *    That reveals nothing about any record.
 *  - 404 (not found) when the caller reaches for a client outside their
 *    scope. Saying "forbidden" there would confirm the record exists.
 */

import { forbidden, invalid, notFound, type McpCaller, type McpRole, type ScopedClient } from "./context";

export const COACH_ROLES: readonly McpRole[] = ["TRAINER", "ADMIN"];
export const ALL_ROLES: readonly McpRole[] = ["TRAINER", "ADMIN", "CLIENT"];

export function authorizeRole(caller: McpCaller, allowed: readonly McpRole[]): void {
  if (!allowed.includes(caller.role)) throw forbidden();
}

/** Finds a client by id inside one workspace, or null. The only way handlers reach a ClientProfile. */
export type ClientLookup = (clientId: string, workspaceId: string) => Promise<ScopedClient | null>;

/**
 * Decide which client a call acts on.
 *
 *  - CLIENT callers always act on their own profile. An argument naming
 *    anyone else is treated as not found.
 *  - TRAINER / ADMIN callers must name a client, and it must be in their
 *    own workspace. ADMIN follows the trainer rule in v1 (no cross-workspace access).
 */
export async function resolveClientScope(
  caller: McpCaller,
  requestedClientId: string | undefined,
  lookup: ClientLookup
): Promise<ScopedClient> {
  if (caller.role === "CLIENT") {
    if (!caller.clientProfileId) throw notFound();
    if (requestedClientId && requestedClientId !== caller.clientProfileId) throw notFound();
    const own = await lookup(caller.clientProfileId, caller.workspaceId);
    if (!own) throw notFound();
    return own;
  }

  if (!requestedClientId) throw invalid("clientId is required when calling as a coach.");
  const client = await lookup(requestedClientId, caller.workspaceId);
  if (!client) throw notFound();
  return client;
}
