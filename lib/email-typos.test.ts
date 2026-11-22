import { describe, expect, it } from "vitest";
import { emailTypo } from "./email-typos";

describe("emailTypo", () => {
  it("catches the slip that locked a client out: .con for .com", () => {
    expect(emailTypo("will@icloud.con")).toBe("will@icloud.com");
  });
  it("catches other common endings and misspelled mail domains", () => {
    expect(emailTypo("a@gmail.cmo")).toBe("a@gmail.com");
    expect(emailTypo("a@x.comm")).toBe("a@x.com");
    expect(emailTypo("a@gmial.com")).toBe("a@gmail.com");
    expect(emailTypo("a@hotmial.com")).toBe("a@hotmail.com");
    expect(emailTypo("a@iclod.com")).toBe("a@icloud.com");
    expect(emailTypo("a@comcast.nte")).toBe("a@comcast.net");
    expect(emailTypo("a@gmail.con")).toBe("a@gmail.com"); // ending first, then the domain list
  });
  it("is case- and space-insensitive and suggests a clean address", () => {
    expect(emailTypo("  Will@iCloud.CON ")).toBe("will@icloud.com");
  });
  it("leaves correct and unusual-but-real addresses alone", () => {
    for (const e of ["will@icloud.com", "a@gmail.com", "a@company.co.uk", "a@studio.co", "a@x.io", "a@con.com", "a@falcon.org", "not-an-email", "@x.com", "a@"]) expect(emailTypo(e)).toBeNull();
  });
});
