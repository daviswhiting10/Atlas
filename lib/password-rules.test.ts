import { describe, expect, it } from "vitest";
import { PASSWORD_MAX, PASSWORD_MIN, passwordProblem } from "./password-rules";

describe("passwordProblem", () => {
  it("accepts a long, ordinary passphrase", () => {
    expect(passwordProblem("blue kettle on the stove", "sam@example.com")).toBeNull();
    expect(passwordProblem("Tr41n!ng-at-dawn", "sam@example.com")).toBeNull();
  });

  it("needs at least the minimum length, and allows exactly it", () => {
    expect(passwordProblem("kq7xm2vp9")).toMatch(/at least/);
    expect(passwordProblem("kq7xm2vp9z")).toBeNull();
    expect("kq7xm2vp9z").toHaveLength(PASSWORD_MIN);
  });

  it("refuses anything past the maximum", () => {
    expect(passwordProblem("kq7xm2vp9z".repeat(21))).toMatch(/too long/);
    expect(passwordProblem("kq7xm2vp9z".repeat(20))).toBeNull();
    expect(PASSWORD_MAX).toBe(200);
  });

  it("refuses common passwords, whatever the case or spacing", () => {
    expect(passwordProblem("password123")).toMatch(/too common/);
    expect(passwordProblem("PassWord123")).toMatch(/too common/);
    expect(passwordProblem("pass word 123")).toMatch(/too common/);
    expect(passwordProblem("atlas12345")).toMatch(/too common/);
  });

  it("refuses runs, keyboard rows and one repeated character", () => {
    expect(passwordProblem("1234567890")).toMatch(/too common/);
    expect(passwordProblem("0987654321")).toMatch(/too common/);
    expect(passwordProblem("abcdefghijk")).toMatch(/too common/);
    expect(passwordProblem("qwertyuiop")).toMatch(/too common/);
    expect(passwordProblem("lkjhgfdsa1")).toBeNull(); // a row plus something else is fine
    expect(passwordProblem("zzzzzzzzzzzz")).toMatch(/too common/);
  });

  it("refuses the email's name inside the password", () => {
    expect(passwordProblem("jordan-lifts-heavy", "jordan@example.com")).toMatch(/email/);
    expect(passwordProblem("my jordanlee rocks", "jordan.lee@example.com")).toMatch(/email/);
    // Names shorter than 4 characters aren't checked (too many false alarms).
    expect(passwordProblem("joe likes squats", "joe@example.com")).toBeNull();
    expect(passwordProblem("jordan-lifts-heavy")).toBeNull();
  });
});
