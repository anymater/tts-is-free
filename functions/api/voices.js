// Cloudflare Pages Function for GET /api/voices.
// Proxies Fish Audio's voice-model list (GET https://api.fish.audio/model)
// so the browser can offer a real picker instead of a hand-pasted
// reference_id. Same contract as /api/fish: the browser sends
// Bearer <FISH_API_KEY> (kept in localStorage only); the key is never
// stored server-side and never committed to the repo.
//
// Query params (all optional):
//   scope=public|mine   (mine adds self=true: only the caller's own models)
//   language=zh         (Fish language filter, e.g. zh / en)
//   q=<title>           (fuzzy title search)
//   page_size=1..50    (default 20)
//   page_number>=1     (default 1)
//   sort_by=task_count|created_at (default task_count: most-used first)
//
// Response: { total, items: [{ id, title, description, languages,
// tags, task_count }] } — only safe display fields are passed through.
'use strict';

const FISH_MODELS_URL = 'https://api.fish.audio/model';
const UPSTREAM_TIMEOUT_MS = 30000;

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanString(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function cleanStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim().slice(0, 40))
    .slice(0, 20);
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const id = cleanString(item._id || item.id, 200);
  if (!id) return null;
  return {
    id,
    title: cleanString(item.title, 200),
    description: cleanString(item.description, 500),
    languages: cleanStringList(item.languages),
    tags: cleanStringList(item.tags),
    task_count: cleanNumber(item.task_count)
  };
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
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' });

  const auth = request.headers.get('Authorization');
  if (!auth || !/^Bearer\s+\S+/.test(auth)) {
    return json(401, { error: 'missing_api_key', detail: 'Authorization: Bearer <FISH_API_KEY> is required.' });
  }

  const url = new URL(request.url);
  const params = new URLSearchParams();
  params.set('page_size', String(clampInt(url.searchParams.get('page_size'), 20, 1, 50)));
  params.set('page_number', String(clampInt(url.searchParams.get('page_number'), 1, 1, 1000)));
  const sortBy = url.searchParams.get('sort_by');
  params.set('sort_by', sortBy === 'created_at' ? 'created_at' : 'task_count');
  const title = cleanString(url.searchParams.get('q'), 200);
  if (title) params.set('title', title);
  const language = cleanString(url.searchParams.get('language'), 20);
  if (language) params.set('language', language);
  if (url.searchParams.get('scope') === 'mine') params.set('self', 'true');

  let upstream;
  try {
    upstream = await fetch(`${FISH_MODELS_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: auth, Accept: 'application/json' },
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

  let data;
  try {
    data = await upstream.json();
  } catch {
    return json(502, { error: 'upstream_error', detail: 'Fish Audio returned an unreadable voice list.' });
  }

  const items = Array.isArray(data?.items) ? data.items.map(normalizeItem).filter(Boolean) : [];
  const total = cleanNumber(data?.total) ?? items.length;
  return json(200, { total, items });
}
