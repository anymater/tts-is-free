// Cloudflare Pages Function for POST /api/mimo.
// Port of handleMimo() in server.js (local Node proxy) to the Workers runtime.
// Dual mode (keep in sync with server.js and ./_official.js):
//   - Browser sends Bearer <MIMO_API_KEY> (localStorage only) → custom mode,
//     key used as-is, no quota counting, identical to the old contract.
//   - No Authorization → official mode: the proxy uses the Pages secret
//     MIMO_OFFICIAL_KEY (context.env) under the same per-IP monthly quota
//     pool as Fish; the official key is never returned to the browser.
'use strict';

import { QUOTA_EXPOSE_HEADERS, finalizeQuotaResponse, resolveApiKey } from './_official.js';

const MIMO_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
const MIMO_DEFAULT_MODEL = 'mimo-v2.5-tts';
const MAX_TEXT = 5000;
const MAX_UPSTREAM_BYTES = 64 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 180000;

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...QUOTA_EXPOSE_HEADERS
    }
  });
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

  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : MIMO_DEFAULT_MODEL;
  if (model.length > 100) return json(400, { error: 'invalid_model', detail: 'model ID must be at most 100 characters.' });

  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 4) {
    return json(400, { error: 'invalid_messages' });
  }

  const messages = [];
  let totalChars = 0;
  for (const message of body.messages) {
    if (!message || typeof message.role !== 'string' || typeof message.content !== 'string') {
      return json(400, { error: 'invalid_messages' });
    }
    const role = ['user', 'assistant', 'system'].includes(message.role) ? message.role : 'user';
    const content = message.content.trim();
    if (!content) return json(400, { error: 'invalid_messages' });
    totalChars += content.length;
    messages.push({ role, content });
  }
  if (totalChars > MAX_TEXT + 600) {
    return json(400, { error: 'text_too_long', detail: `messages must total at most ${MAX_TEXT + 600} characters.` });
  }

  const audio = body.audio && typeof body.audio === 'object' ? body.audio : {};
  const voice = typeof audio.voice === 'string' && audio.voice.trim() ? audio.voice.trim().slice(0, 60) : '冰糖';
  const format = audio.format === 'mp3' ? 'mp3' : 'wav';

  // 与 /api/fish 共用同一个官方额度池（见 ./_official.js）。
  const resolved = await resolveApiKey({ request, env: context.env, provider: 'mimo' });
  if (resolved.early) return resolved.early;

  let upstream;
  try {
    upstream = await fetch(MIMO_URL, {
      method: 'POST',
      headers: { Authorization: resolved.auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model, messages, audio: { format, voice } }),
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

  const raw = await upstream.text();
  if (raw.length > MAX_UPSTREAM_BYTES) return json(502, { error: 'upstream_too_large' });
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json(502, { error: 'upstream_error', detail: 'MiMo returned invalid JSON.' });
  }

  // 只有上游确实带回音频才计入官方额度（校验字段路径与前端 api.js 一致）。
  const audioField = data?.choices?.[0]?.message?.audio;
  const hasAudio = Boolean(
    (typeof audioField === 'string' && audioField) ||
    (audioField && typeof audioField.data === 'string' && audioField.data)
  );
  return finalizeQuotaResponse(
    new Response(raw, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...QUOTA_EXPOSE_HEADERS }
    }),
    hasAudio ? resolved.quota : null
  );
}
