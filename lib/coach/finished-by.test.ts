import { describe, expect, it } from "vitest";
import { FINISHED_BY_CLIENT, finishedByClient } from "./finished-by";

describe("finishedByClient", () => {
  const done = new Date();
  it("marks a finished session whose workout was finished by the client", () => {
    expect(finishedByClient({ loggedBy: "CLIENT", completedAt: done })).toBe(true);
    expect(finishedByClient({ loggedBy: "CLIENT", completedAt: done.toISOString() })).toBe(true);
  });
  it("does not mark trainer-logged, unfinished or plan-less sessions", () => {
    expect(finishedByClient({ loggedBy: "TRAINER", completedAt: done })).toBe(false);
    expect(finishedByClient({ loggedBy: "CLIENT", completedAt: null })).toBe(false);
    expect(finishedByClient({ loggedBy: null, completedAt: done })).toBe(false);
    expect(finishedByClient(null)).toBe(false);
    expect(finishedByClient(undefined)).toBe(false);
  });
  it("claims only the finish, not every set", () => {
    expect(FINISHED_BY_CLIENT).toBe("Finished by client");
    expect(FINISHED_BY_CLIENT.toLowerCase()).not.toMatch(/logged|every|all sets/);
  });
});
