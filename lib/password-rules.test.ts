import { describe, expect, it } from "vitest";
import { PASSWORD_MAX, PASSWORD_MIN, passwordBlock, passwordWarning } from "./password-rules";

describe("passwordBlock: the only things that are refused", () => {
  it("nothing typed, or past the hashing limit", () => {
    expect(passwordBlock("")).toMatch(/Choose a password/);
    expect(passwordBlock("x".repeat(PASSWORD_MAX + 1))).toMatch(/too long/);
  });
  it("anything else may be set: one character, a common word, the email", () => {
    for (const p of ["a", "1234", "password", "qwertyuiop", "jordan", "x".repeat(PASSWORD_MAX)]) expect(passwordBlock(p)).toBeNull();
  });
});

describe("passwordWarning: only ever a warning, never a refusal", () => {
  it("is quiet for an ordinary passphrase", () => {
    expect(passwordWarning("blue kettle on the stove", "sam@example.com")).toBeNull();
    expect(passwordWarning("Tr41n!ng-at-dawn", "sam@example.com")).toBeNull();
  });
  it("warns when short, and not at exactly the minimum", () => {
    expect(passwordWarning("kq7xm2vp9")).toMatch(/short/);
    expect(passwordWarning("kq7xm2vp9z")).toBeNull();
    expect("kq7xm2vp9z").toHaveLength(PASSWORD_MIN);
  });
  it("warns about common passwords, whatever the case or spacing", () => {
    for (const p of ["password123", "PassWord123", "pass word 123", "atlas12345"]) expect(passwordWarning(p)).toMatch(/common/);
  });
  it("warns about runs, keyboard rows and one repeated character", () => {
    for (const p of ["1234567890", "0987654321", "abcdefghijk", "qwertyuiop", "zzzzzzzzzzzz"]) expect(passwordWarning(p)).toMatch(/common/);
    expect(passwordWarning("lkjhgfdsa1")).toBeNull(); // a row plus something else is fine
  });
  it("warns when it contains the email's name, only for names of 4+ letters", () => {
    expect(passwordWarning("jordan-lifts-heavy", "jordan@example.com")).toMatch(/email/);
    expect(passwordWarning("my jordanlee rocks", "jordan.lee@example.com")).toMatch(/email/);
    expect(passwordWarning("joe likes squats", "joe@example.com")).toBeNull();
    expect(passwordWarning("jordan-lifts-heavy")).toBeNull();
  });
});
