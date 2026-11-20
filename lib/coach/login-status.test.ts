import { describe, expect, it } from "vitest";
import { loginStatus } from "./login-status";

const opened = new Date("2026-11-21T10:00:00Z");

describe("loginStatus", () => {
  it("no login and no email: nothing to show", () => {
    expect(loginStatus({ hasEmail: false }, null)).toBeNull();
  });
  it("no login but an email: not invited", () => {
    expect(loginStatus({ hasEmail: true }, null)?.key).toBe("not_invited");
  });
  it("a login whose link was never used: invited", () => {
    expect(loginStatus({ hasEmail: true }, { emailVerified: null, hasPassword: false })?.key).toBe("invited");
  });
  it("a link was used, no password: opened", () => {
    expect(loginStatus({ hasEmail: true }, { emailVerified: opened, hasPassword: false })?.key).toBe("opened");
  });
  it("a password beats everything", () => {
    expect(loginStatus({ hasEmail: true }, { emailVerified: opened, hasPassword: true })?.key).toBe("password");
    expect(loginStatus({ hasEmail: true }, { emailVerified: null, hasPassword: true })?.key).toBe("password");
  });
});
