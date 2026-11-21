import { describe, expect, it } from "vitest";
import { FINISHED_BY_CLIENT, FINISHED_BY_RELIABLE_FROM, finishedByClient } from "./finished-by";

describe("finishedByClient", () => {
  const after = new Date(FINISHED_BY_RELIABLE_FROM.getTime() + 3_600_000);
  const before = new Date(FINISHED_BY_RELIABLE_FROM.getTime() - 3_600_000);

  it("marks a session the client finished after the fix shipped", () => {
    expect(finishedByClient({ loggedBy: "CLIENT", completedAt: after })).toBe(true);
    expect(finishedByClient({ loggedBy: "CLIENT", completedAt: after.toISOString() })).toBe(true);
  });
  it("never marks an older session: before the fix, CLIENT can't be trusted", () => {
    expect(finishedByClient({ loggedBy: "CLIENT", completedAt: before })).toBe(false);
  });
  it("does not mark coach-finished, unfinished or plan-less sessions", () => {
    expect(finishedByClient({ loggedBy: "TRAINER", completedAt: after })).toBe(false);
    expect(finishedByClient({ loggedBy: "CLIENT", completedAt: null })).toBe(false);
    expect(finishedByClient({ loggedBy: null, completedAt: after })).toBe(false);
    expect(finishedByClient(null)).toBe(false);
  });
  it("takes the cut-off as given", () => {
    expect(finishedByClient({ loggedBy: "CLIENT", completedAt: before }, new Date(0))).toBe(true);
  });
  it("claims only the finish, not every set", () => {
    expect(FINISHED_BY_CLIENT).toBe("Finished by client");
  });
});
