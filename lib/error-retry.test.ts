import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// A screen failed because the database connection dropped (as in W4's fuzz run 111): ECONNRESET.
const { drop, calls } = vi.hoisted(() => ({
  drop: Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" }),
  calls: [] as string[],
}));

// Each error screen is called as a plain function (no DOM here): its hooks are stubbed so the
// tree it returns can be searched for Try again, and that button's real onClick pressed.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useEffect: () => {},
  useTransition: () => [false, (fn: () => void) => fn()],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => calls.push("refresh"), push() {} }) }));

type El = ReactElement<{ children?: ReactNode; onClick?: () => void; type?: string }>;
function tryAgain(node: ReactNode): El | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = tryAgain(n);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as El;
  const text = (n: ReactNode): string => (typeof n === "string" ? n : Array.isArray(n) ? n.map(text).join("") : n && typeof n === "object" ? text((n as El).props.children) : "");
  if (el.type === "button" && text(el.props.children).includes("Try again")) return el;
  return tryAgain(el.props?.children);
}

const screens = {
  "the app-wide error screen (app/error.tsx)": () => import("@/app/error"),
  "the Plan tab's error screen": () => import("@/app/(client)/plan/error"),
};

describe.each(Object.entries(screens))("%s, after a connection reset", (_, load) => {
  beforeEach(() => {
    calls.length = 0;
  });
  it("Try again asks the server for the page again, then redraws (not a redraw of the failed page)", async () => {
    const { default: Screen } = await load();
    const tree = (Screen as (p: { error: Error; reset: () => void }) => ReactNode)({ error: drop, reset: () => calls.push("reset") });
    const button = tryAgain(tree);
    expect(button).not.toBeNull();
    button!.props.onClick!();
    expect(calls).toEqual(["refresh", "reset"]);
  });
});
