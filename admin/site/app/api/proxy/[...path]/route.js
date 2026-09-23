// Server-side proxy between the admin site's browser and the FastAPI
// backend.
//
// Two auth methods, tried in order:
//   1. The session cookie set by the login page. Forwarded as
//      `Authorization: Bearer <token>`.
//   2. The ADMIN_API_KEY environment variable (Phase 14 fallback),
//      forwarded as `X-Admin-Key`. Used only when there's no cookie,
//      so the CLI scripts and pre-login tooling keep working.

import { NextResponse } from 'next/server';

import {
  getAdminKey,
  getBackendUrl,
  getSessionToken,
} from '@/lib/auth';

async function forward(request, { params }) {
  const backendUrl = getBackendUrl();
  const path = '/' + (params.path || []).join('/');
  const url = new URL(request.url);
  const target = backendUrl + path + url.search;

  // Body.
  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  // Auth headers — session first, key fallback.
  const headers = {};
  const sessionToken = getSessionToken();
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  } else {
    const adminKey = getAdminKey();
    if (adminKey) {
      headers['X-Admin-Key'] = adminKey;
    }
  }

  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  let response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body,
    });
  } catch (err) {
    return NextResponse.json(
      {
        detail: `Cannot reach backend at ${backendUrl}. Is the API running?`,
        code: 'BackendUnreachable',
      },
      { status: 502 }
    );
  }

  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await response.arrayBuffer();
  return new NextResponse(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
  });
}

export async function GET(request, ctx) {
  return forward(request, ctx);
}
export async function POST(request, ctx) {
  return forward(request, ctx);
}
export async function PATCH(request, ctx) {
  return forward(request, ctx);
}
export async function PUT(request, ctx) {
  return forward(request, ctx);
}
export async function DELETE(request, ctx) {
  return forward(request, ctx);
}