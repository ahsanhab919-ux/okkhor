import { NextRequest, NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE } from "@/src/modules/identity/domain/auth-config";
import { verifyAccessTokenEdge } from "@/src/modules/identity/domain/auth-jwt";

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return redirectToAuth(request);
  }

  try {
    await verifyAccessTokenEdge(accessToken);

    return NextResponse.next();
  } catch {
    return redirectToAuth(request);
  }
}

function redirectToAuth(request: NextRequest) {
  const url = request.nextUrl.clone();
  const authUrl = new URL("/auth", url.origin);

  authUrl.searchParams.set("next", `${url.pathname}${url.search}`);

  return NextResponse.redirect(authUrl);
}

export const config = {
  matcher: [
    "/search/:path*",
    "/community/:path*",
    "/categories/:path*",
    "/scholar-verify/:path*",
    "/studio/:path*",
    "/admin/:path*",
    "/library/:path*",
    "/profile/:path*",
  ],
};
