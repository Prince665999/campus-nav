// Proxies the login request to the backend.

import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/auth';

export async function POST(request) {
  const backendUrl = getBackendUrl();
  const body = await request.arrayBuffer();

  try {
    const response = await fetch(`${backendUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.arrayBuffer();
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
    });
  } catch {
    return NextResponse.json(
      { detail: 'Cannot reach backend.' },
      { status: 502 }
    );
  }
}