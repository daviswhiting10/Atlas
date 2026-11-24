import { describe, expect, it } from "vitest";
import { pairRest, restDue } from "./superset-rest";

const S = (...n: number[]) => new Set(n);
describe("one rest timer for a superset pair", () => {
  const nums = (id: string) => ({ a: S(1, 2, 3), b: S(1, 2, 3), c: S(1, 2) })[id as "a" | "b" | "c"];
  it("a lone exercise rests after each set", () => {
    expect(restDue(["a"], "a", 1, () => S(), nums)).toBe(true);
    expect(restDue([], "a", 1, () => S(), nums)).toBe(true);
  });
  it("3A logged first: no timer yet; 3B logged: the timer starts", () => {
    const logged = (id: string) => (id === "a" ? S(1) : S());
    expect(restDue(["a", "b"], "a", 1, logged, nums)).toBe(false);
    const both = (id: string) => (id === "a" || id === "b" ? S(1) : S());
    expect(restDue(["a", "b"], "b", 1, both, nums)).toBe(true);
  });
  it("it is per set: set 2 waits for both again", () => {
    const logged = (id: string) => (id === "a" ? S(1, 2) : S(1));
    expect(restDue(["a", "b"], "a", 2, logged, nums)).toBe(false);
  });
  it("either order works: B first, then A", () => {
    const loggedB = (id: string) => (id === "b" ? S(1) : S());
    expect(restDue(["a", "b"], "b", 1, loggedB, nums)).toBe(false);
    const both = () => S(1);
    expect(restDue(["a", "b"], "a", 1, both, nums)).toBe(true);
  });
  it("a partner with no such set isn't waited for", () => {
    expect(restDue(["a", "c"], "a", 3, () => S(), nums)).toBe(true);
  });
  it("three in a giant set: all must be logged", () => {
    const nums3 = () => S(1);
    const two = (id: string) => (id === "x" || id === "y" ? S(1) : S());
    expect(restDue(["x", "y", "z"], "x", 1, two, nums3)).toBe(false);
    expect(restDue(["x", "y", "z"], "z", 1, () => S(1), nums3)).toBe(true);
  });
  it("the pair rests as long as the longer of the two", () => {
    expect(pairRest([60, 90])).toBe(90);
    expect(pairRest([])).toBe(0);
  });
});
