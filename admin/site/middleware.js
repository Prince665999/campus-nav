// Next.js middleware. Runs on every request before routing.
//
// Checks for the session cookie on protected paths. If there's no
// cookie, redirects to /login.

import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'campus_admin_session';

// Paths that don't need a login.
const PUBLIC_PATHS = ['/login'];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public paths.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow the API routes the login flow uses.
  if (pathname.startsWith('/api/admin/login') || pathname.startsWith('/api/admin/logout')) {
    return NextResponse.next();
  }

  // For everything else, check the session cookie.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next.js internals, static files, and
  // the proxy route (the proxy handles its own auth).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/proxy).*)',
  ],
};