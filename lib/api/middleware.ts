import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
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
 *   - A valid authenticated session with a coach role (TRAINER or ADMIN)
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

    // Coach routes only. Athletes (role CLIENT) can sign themselves up, so
    // "signed in" is no longer the same thing as "is the coach".
    if (session.user.role === "CLIENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let workspaceId = session.user.workspaceId;
    if (!workspaceId) {
      // JWT is stale — look up or bootstrap workspace from DB
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, workspaceId: true },
      });
      workspaceId = dbUser?.workspaceId ?? undefined;

      // First sign-in on a brand-new database: create the workspace. A user
      // is never attached to a workspace that already exists.
      if (!workspaceId && dbUser && (await prisma.workspace.count()) === 0) {
        const created = await prisma.workspace.create({
          data: { name: dbUser.name ?? dbUser.email ?? "My Workspace" },
          select: { id: true },
        });
        await prisma.user.update({ where: { id: dbUser.id }, data: { workspaceId: created.id } });
        workspaceId = created.id;
      }
    }
    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace associated with this account. Contact support." },
        { status: 403 }
      );
    }

    return handler(req, { userId: session.user.id, workspaceId }, ctx);
  };
}
