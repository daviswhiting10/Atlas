import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proofOk, stampProof } from "./proof";

const saved = process.env.AUTH_SECRET;
beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-one";
});
afterEach(() => {
  process.env.AUTH_SECRET = saved;
});

describe("password-stamp proof", () => {
  const stamp = Date.parse("2026-11-15T09:30:00.123Z");

  it("accepts the proof the server made for this user and stamp", () => {
    expect(proofOk("user-1", stamp, stampProof("user-1", stamp))).toBe(true);
  });

  it("refuses it for another user, another stamp, or a stamp of 0", () => {
    const p = stampProof("user-1", stamp);
    expect(proofOk("user-2", stamp, p)).toBe(false);
    expect(proofOk("user-1", stamp + 1, p)).toBe(false);
    expect(proofOk("user-1", 0, p)).toBe(false);
  });

  it("refuses anything that isn't a string, and wrong lengths", () => {
    expect(proofOk("user-1", stamp, undefined)).toBe(false);
    expect(proofOk("user-1", stamp, 123)).toBe(false);
    expect(proofOk("user-1", stamp, "")).toBe(false);
    expect(proofOk("user-1", stamp, stampProof("user-1", stamp) + "x")).toBe(false);
  });

  it("depends on AUTH_SECRET, so a client can't make one", () => {
    const p = stampProof("user-1", stamp);
    process.env.AUTH_SECRET = "a-different-secret";
    expect(proofOk("user-1", stamp, p)).toBe(false);
  });
});
