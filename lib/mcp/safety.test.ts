import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
});

import { TOOLS } from "./server";

/** Every property name anywhere in a JSON Schema, nested objects and arrays included. */
function keys(schema: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((s) => keys(s, out));
  else if (schema && typeof schema === "object") {
    for (const [k, v] of Object.entries(schema)) {
      if (k === "properties" && v && typeof v === "object") Object.keys(v).forEach((p) => out.add(p));
      keys(v, out);
    }
  }
  return out;
}

describe("no MCP tool can set the minor flag or touch photos", () => {
  const writes = TOOLS.filter((t) => t.permission === "write");

  it("covers the write tools", () => {
    expect(writes.map((t) => t.name).sort()).toEqual(["create_plan_from_outline", "edit_plan", "log_workout"]);
  });

  it.each(TOOLS.map((t) => [t.name, t] as const))("%s: no isMinor, isYouth or photo field in its input", (_, t) => {
    const names = Array.from(keys(z.toJSONSchema(t.input, { io: "input", unrepresentable: "any" })));
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => /isMinor|isYouth|minor|youth|photo/i.test(n))).toEqual([]);
  });
});
