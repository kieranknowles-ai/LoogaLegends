import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/propose", "/second", "/admin"];
const COOKIE_NAME = "looga_session";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needsAuth = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  // Lightweight cookie-presence check. Full HMAC verification happens in lib/auth.ts
  // when the page renders — proxy just bounces obvious anonymous traffic.
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
