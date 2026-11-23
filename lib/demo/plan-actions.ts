"use server";

/** The demo's plan is read-only: every edit answers the same way, and nothing is changed. */
const NOT_IN_DEMO = { ok: false as const, error: "Changing the plan isn't part of the demo." };
export async function demoNoEdit(): Promise<typeof NOT_IN_DEMO> {
  return NOT_IN_DEMO;
}
