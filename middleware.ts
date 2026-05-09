import NextAuth from "next-auth";
import authConfig from "./lib/auth.config";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

export async function middleware(req: NextRequest) {
  try {
    // auth() returns NextResponse | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (auth as any)(req);
  } catch (err) {
    console.error("[middleware crash]", err);
    // Don't block the user — let the request through so the error is visible
    return undefined;
  }
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
