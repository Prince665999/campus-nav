// Server-side proxy between the admin site's browser and the FastAPI
// backend.
//
// Why this exists: the admin site needs to send an ADMIN_API_KEY
// with every backend request. If the browser sent that key directly,
// anyone with dev tools open could read it. So instead the browser
// calls /api/proxy/*, this file runs on the Next.js server, adds the
// key, and forwards to the backend.
//
// The browser never sees the key, the backend URL, or anything else
// server-side.

import { NextResponse } from 'next/server';
import { getAdminKey, getBackendUrl } from '@/lib/auth';

async function forward(request, { params }) {
  const backendUrl = getBackendUrl();
  const adminKey = getAdminKey();

  // The path segments come in as params.path — an array. Rejoin them.
  const path = '/' + (params.path || []).join('/');

  // Preserve the query string.
  const url = new URL(request.url);
  const target = backendUrl + path + url.search;

  // Forward the request body if there is one. For multipart uploads
  // (photos), we forward the raw stream rather than parsing it.
  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  const headers = {
    'X-Admin-Key': adminKey,
  };

  // Forward the content type so the backend knows how to parse the
  // body.
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

  // 204 No Content — pass through.
  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  // Pass through the response body and status.
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