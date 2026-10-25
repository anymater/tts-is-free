// Cloudflare Pages Function for GET /api/health.
// Mirrors the /api/health branch in server.js. No secret involved.
'use strict';

export function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  return new Response(JSON.stringify({ ok: true, fishModel: 's2.1-pro-free', mimoDefaultModel: 'mimo-v2.5-tts' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
