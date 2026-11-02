// Cloudflare Pages Function for POST /api/fish.
// Port of handleFish() in server.js (local Node proxy) to the Workers runtime.
// Dual mode: the browser may send Bearer <FISH_API_KEY> (kept in localStorage
// only) — then it is used as-is and nothing is counted. Without Authorization
// the request falls back to the official key (env FISH_OFFICIAL_KEY) under the
// per-IP monthly quota in _official.js. The official key never leaves the
// proxy; only audio/errors are forwarded.
'use strict';

import { QUOTA_EXPOSE_HEADERS, finalizeQuotaResponse, resolveApiKey } from './_official.js';

const FISH_URL = 'https://api.fish.audio/v1/tts';
const FISH_MODEL = 's2.1-pro-free';
const MAX_TEXT = 5000;
const MAX_UPSTREAM_BYTES = 64 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 180000;

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function normalizeProsody(prosody) {
  if (!prosody || typeof prosody !== 'object') return null;
  const out = {};
  const speed = clampNumber(prosody.speed, 0.5, 2);
  const volume = clampNumber(prosody.volume, -20, 20);
  if (speed !== null) out.speed = speed;
  if (volume !== null) out.volume = volume;
  return Object.keys(out).length ? out : null;
}

function extractErrorMessage(text) {
  if (!text) return '';
  try {
    const data = JSON.parse(text);
    const candidate = data?.error?.message || data?.error || data?.message || data?.detail;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 1000);
    if (candidate && typeof candidate === 'object') return JSON.stringify(candidate).slice(0, 1000);
  } catch {
    // Not JSON — fall through to raw text.
  }
  return text.trim().slice(0, 1000);
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!body || typeof body !== 'object') return json(400, { error: 'invalid_body' });

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const referenceId = typeof body.reference_id === 'string' ? body.reference_id.trim() : '';
  if (!text) return json(400, { error: 'missing_text', detail: 'text is required.' });
  if (text.length > MAX_TEXT) return json(400, { error: 'text_too_long', detail: `text must be at most ${MAX_TEXT} characters.` });
  if (!referenceId) return json(400, { error: 'missing_reference_id', detail: 'reference_id is required for Fish Audio.' });
  if (referenceId.length > 200) return json(400, { error: 'invalid_reference_id' });

  const format = body.format === 'wav' ? 'wav' : 'mp3';
  const payload = { text, reference_id: referenceId, format };
  const prosody = normalizeProsody(body.prosody);
  if (prosody) payload.prosody = prosody;

  // 解析本次请求应使用的 Authorization：自定义 Key 原样透传；无 Key 走
  // 官方 Key + 额度。缺官方 Key / 缺 KV → 503，超额 → 429，均不请求上游。
  const resolved = await resolveApiKey({ request, env: context.env, provider: 'fish' });
  if (resolved.early) return resolved.early;

  let upstream;
  try {
    upstream = await fetch(FISH_URL, {
      method: 'POST',
      headers: { Authorization: resolved.auth, 'Content-Type': 'application/json', Accept: 'audio/*', model: FISH_MODEL },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return json(timedOut ? 504 : 502, {
      error: timedOut ? 'upstream_timeout' : 'upstream_unreachable',
      detail: timedOut ? 'The upstream API took too long to respond.' : 'The upstream API could not be reached.'
    });
  }

  if (!upstream.ok) {
    const detail = extractErrorMessage((await upstream.text()).slice(0, 4000));
    return json(upstream.status, { error: 'upstream_error', status: upstream.status, detail });
  }

  const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('json') || contentType.includes('text/html')) {
    return json(502, { error: 'upstream_error', detail: extractErrorMessage((await upstream.text()).slice(0, 4000)) });
  }

  const buffer = await upstream.arrayBuffer();
  if (buffer.byteLength > MAX_UPSTREAM_BYTES) return json(502, { error: 'upstream_too_large' });
  if (!buffer.byteLength) return json(502, { error: 'empty_audio', detail: 'Fish Audio returned no audio.' });

  // 只有成功拿到音频才计入官方额度。
  return finalizeQuotaResponse(
    new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType || (format === 'wav' ? 'audio/wav' : 'audio/mpeg'),
        'Cache-Control': 'no-store',
        'X-Audio-Format': format,
        ...QUOTA_EXPOSE_HEADERS
      }
    }),
    resolved.quota
  );
}
