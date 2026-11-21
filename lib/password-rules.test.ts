import { describe, expect, it } from "vitest";
import { PASSWORD_MAX, PASSWORD_MIN, passwordBlock, passwordWarning } from "./password-rules";

describe("passwordBlock: the only things that are refused", () => {
  it("needs the minimum length, and allows exactly it", () => {
    expect(passwordBlock("kq7xm2vp9")).toMatch(/at least 10/);
    expect(passwordBlock("")).toMatch(/at least 10/);
    expect(passwordBlock("kq7xm2vp9z")).toBeNull();
    expect("kq7xm2vp9z").toHaveLength(PASSWORD_MIN);
  });
  it("refuses anything past the maximum", () => {
    expect(passwordBlock("kq7xm2vp9z".repeat(21))).toMatch(/too long/);
    expect(passwordBlock("kq7xm2vp9z".repeat(20))).toBeNull();
    expect(PASSWORD_MAX).toBe(200);
  });
  it("refuses the very most common passwords, whatever the case or spacing", () => {
    for (const p of ["1234567890", "qwertyuiop", "password123", "1q2w3e4r5t", "0987654321", "1111111111", "QwertyUiop", "1234 5678 90"]) expect(passwordBlock(p)).toMatch(/most common/);
  });
  it("refuses nothing else: weak-looking, common-ish and email-like passwords are all allowed through the block", () => {
    for (const p of ["aaaaaaaaaaaa", "abcdefghijk", "lkjhgfdsa1x", "football123", "jordan-lifts-heavy", "9876543210123"]) expect(passwordBlock(p)).toBeNull();
  });
});

describe("passwordWarning: a gentle note, never a refusal", () => {
  it("is quiet for an ordinary passphrase or a mixed password", () => {
    for (const p of ["blue kettle on the stove", "Tr41n!ng-at-dawn", "kq7xm2vp9z", "correct horse battery staple", "lkjhgfdsa1"]) expect(passwordWarning(p)).toBeNull();
  });
  it("warns about common words, whatever the case or spacing", () => {
    for (const p of ["football123", "FootBall123", "foot ball 123", "atlas12345", "workout123"]) expect(passwordWarning(p)).toBe("This looks easy to guess.");
  });
  it("warns about simple patterns: one repeated character, runs, keyboard rows", () => {
    for (const p of ["zzzzzzzzzzzz", "abcdefghijk", "9876543210", "asdfghjkl", "zxcvbnm"]) expect(passwordWarning(p)).toBe("This looks easy to guess.");
  });
  it("warns about all one kind of character, but not a phrase with spaces or a mix", () => {
    expect(passwordWarning("7391846205")).toBe("This looks easy to guess."); // digits only
    expect(passwordWarning("kjhgfdsqwzxplm")).toBe("This looks easy to guess."); // lowercase only
    expect(passwordWarning("KJHGFDSQWZXPLM")).toBe("This looks easy to guess."); // uppercase only
    expect(passwordWarning("kjhgf dsqwz xplm")).toBeNull(); // a phrase
    expect(passwordWarning("kjhgfdsqwz7")).toBeNull(); // letters and a digit
  });
  it("says nothing about the email address: that rule is gone", () => {
    expect(passwordWarning("jordan-lifts-heavy-2026")).toBeNull();
  });
});
