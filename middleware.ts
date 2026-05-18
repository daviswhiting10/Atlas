import NextAuth from "next-auth";
import authConfig from "./lib/auth.config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const CLIENT_PATHS = ["/today", "/client"];
const isClientPath = (p: string) => CLIENT_PATHS.some((cp) => p === cp || p.startsWith(cp + "/"));
const isApiClientPath = (p: string) => p.startsWith("/api/client/");

export async function middleware(req: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (auth as any)(req);

    // After base auth check, enforce role-based routing
    const session = await auth();
    const role = session?.user?.role ?? "TRAINER";
    const path = req.nextUrl.pathname;

    // CLIENT accessing a trainer route → redirect to /today
    if (role === "CLIENT" && !isClientPath(path) && !isApiClientPath(path)) {
      return NextResponse.redirect(new URL("/today", req.url));
    }

    // TRAINER/ADMIN accessing a client-only route → redirect to /inbox
    if (role !== "CLIENT" && (isClientPath(path) || isApiClientPath(path))) {
      return NextResponse.redirect(new URL("/inbox", req.url));
    }

    return response;
  } catch (err) {
    console.error("[middleware crash]", err);
    return undefined;
  }
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
