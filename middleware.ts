import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname === "/login";

  if (!isLoggedIn && !isAuthPage) {
    const from = encodeURIComponent(pathname);
    return Response.redirect(new URL(`/login?from=${from}`, req.url));
  }

  if (isLoggedIn && isAuthPage) {
    return Response.redirect(new URL("/", req.url));
  }
});

export const config = {
  // Protect everything except Auth.js routes, Next.js internals, and static files
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
