// Clears the session cookie.

import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('campus_admin_session', '', {
    path: '/',
    maxAge: 0,
  });
  return response;
}