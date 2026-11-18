import { describe, expect, it } from "vitest";
import { errorCopy } from "./error-copy";

describe("errorCopy", () => {
  it("a used or expired link says so and sends the client back to their trainer", () => {
    expect(errorCopy("Verification")).toEqual({ title: "This link has expired.", message: "Ask your trainer for a new one.", action: "sign-in" });
  });
  it("no access offers to sign out", () => {
    expect(errorCopy("NoAccess").action).toBe("sign-out");
  });
  it("known codes keep their message", () => {
    expect(errorCopy("EmailSignin").message).toMatch(/could not be sent/);
    expect(errorCopy("CredentialsSignin").message).toBe("Invalid credentials.");
  });
  it("a missing or unknown code gets the plain default, never a wrong claim about the link", () => {
    for (const code of [null, undefined, "", "Nope", "AccessDenied"]) {
      const c = errorCopy(code);
      expect(c.title).toBe("Sign-in failed");
      expect(c.message).not.toMatch(/expired|used/i);
    }
  });
});
