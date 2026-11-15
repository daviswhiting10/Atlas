import { describe, expect, it } from "vitest";
import { maskEmail } from "./mask";

describe("maskEmail", () => {
  it("keeps the first and last letter of the name, the first of the domain, and the ending", () => {
    expect(maskEmail("davis@athlete.co")).toBe("d***s@a******.co");
    expect(maskEmail("sam@gmail.com")).toBe("s*m@g****.com");
  });
  it("copes with very short names and odd input", () => {
    expect(maskEmail("ab@x.io")).toBe("a*@x*.io");
    expect(maskEmail("a@b.c")).toBe("a*@b*.c");
    expect(maskEmail("no-at-sign")).toBe("n********n@");
  });
});
