import { describe, expect, it, vi } from "vitest";
import { shareInvite } from "./invite-share";

const invite = { link: "https://atlas.example/api/auth/callback/email?token=abc" };

describe("shareInvite", () => {
  it("opens the share sheet with the link and a short line", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareInvite(invite, "Sam", { share })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Atlas", text: "Sam, you're invited to Atlas. Open this link to sign in:", url: invite.link });
  });

  it("no share sheet: the caller shows the link to copy", async () => {
    expect(await shareInvite(invite, "Sam", {})).toBe("unavailable");
    expect(await shareInvite(invite, "Sam", undefined)).toBe("unavailable");
  });

  it("a browser that says it can't share this: unavailable, and nothing is shared", async () => {
    const share = vi.fn();
    expect(await shareInvite(invite, "Sam", { share, canShare: () => false })).toBe("unavailable");
    expect(share).not.toHaveBeenCalled();
  });

  it("closing the share sheet is a cancel, not an error", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    expect(await shareInvite(invite, "Sam", { share })).toBe("cancelled");
  });

  it("a refusal (no permission after a slow request) falls back to the link", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    expect(await shareInvite(invite, "Sam", { share })).toBe("unavailable");
  });
});
