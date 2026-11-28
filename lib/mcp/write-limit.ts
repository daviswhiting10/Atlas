/** The MCP write limit (POLICIES.mcpWriteUser), counted in the database so every server instance shares it. */

import { POLICIES, record, throttleKey, waitFor } from "@/lib/auth/throttle";

export async function allowMcpWrite(userId: string, now = new Date()): Promise<boolean> {
  const key = throttleKey("mcpWriteUser", userId);
  if ((await waitFor(key, now)) > 0) return false;
  await record(key, POLICIES.mcpWriteUser, now);
  return true;
}
