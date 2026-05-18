import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export type ClientAuthContext = {
  userId: string;
  workspaceId: string;
  clientProfileId: string;
};

type NextRouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

type ClientHandler<P extends Record<string, string> = Record<string, string>> = (
  req: Request,
  ctx: ClientAuthContext,
  routeCtx: NextRouteContext<P>
) => Promise<Response>;

export function withClient<P extends Record<string, string> = Record<string, string>>(
  handler: ClientHandler<P>
): (req: Request, ctx?: NextRouteContext<P>) => Promise<Response> {
  return async (
    req: Request,
    routeCtx: NextRouteContext<P> = { params: Promise.resolve({} as P) }
  ): Promise<Response> => {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "CLIENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: "No client profile linked to this account" }, { status: 403 });
    }
    const workspaceId = session.user.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace" }, { status: 403 });
    }

    return handler(
      req,
      { userId: session.user.id, workspaceId, clientProfileId },
      routeCtx
    );
  };
}
