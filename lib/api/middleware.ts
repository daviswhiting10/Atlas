import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export type AuthContext = {
  userId: string;
  workspaceId: string;
};

// Next.js App Router dynamic params are a Promise in Next 14+
type NextRouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

type AuthedHandler<P extends Record<string, string> = Record<string, string>> = (
  req: Request,
  authCtx: AuthContext,
  ctx: NextRouteContext<P>
) => Promise<Response>;

/**
 * withWorkspace — structural auth + tenant scope for every route handler.
 *
 * Usage (static route):
 *   export const GET = withWorkspace(async (req, { workspaceId }) => { ... })
 *
 * Usage (dynamic route):
 *   export const GET = withWorkspace<{ id: string }>(async (req, { workspaceId }, { params }) => {
 *     const { id } = await params
 *   })
 *
 * Every handler wrapped here is guaranteed to have:
 *   - A valid authenticated session
 *   - A workspaceId from the JWT (no extra DB round-trip)
 */
export function withWorkspace<P extends Record<string, string> = Record<string, string>>(
  handler: AuthedHandler<P>
): (req: Request, ctx?: NextRouteContext<P>) => Promise<Response> {
  return async (
    req: Request,
    ctx: NextRouteContext<P> = { params: Promise.resolve({} as P) }
  ): Promise<Response> => {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = session.user.workspaceId;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace associated with this account. Contact support." },
        { status: 403 }
      );
    }

    return handler(req, { userId: session.user.id, workspaceId }, ctx);
  };
}
