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
//   tag=<tag>           (Fish tag filter, e.g. female / male)
//   licensed=true       (only Fish-licensed voices; used for 默认声音)
//   page_size=1..50    (default 20)
//   page_number>=1     (default 1)
//   sort_by=score|task_count|created_at (default score: Fish's recommendation rank)
//
// Response: { total, items: [{ id, title, description, languages, tags,
// task_count, like_count, mark_count, shared_count, cover_image (resolved
// to a full https URL when Fish returns a relative R2 path), sample_audio
// (first training-sample audio URL, '' when none),
// author: { nickname, avatar } | null, created_at, state, visibility,
// liked, marked }] } — only safe display fields are passed through, and
// image URLs are restricted to http(s).
'use strict';

const FISH_MODELS_URL = 'https://api.fish.audio/model';
// Short timeout: a voice list should answer in seconds. Kept well under
// the platform's wall-clock limit so a slow upstream still yields a clean
// 504 JSON instead of a dropped connection.
const UPSTREAM_TIMEOUT_MS = 15000;

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

function cleanUrl(value) {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  return /^https?:\/\/\S{1,500}$/.test(url) ? url : '';
}

// Fish returns cover_image as a relative R2 path ("coverimage/<hash>"),
// not a full URL. Verified 2026-11-02: public-platform.r2.fish.audio
// serves it as image/jpeg.
function cleanCoverUrl(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  if (/^https?:\/\/\S{1,500}$/.test(v)) return v;
  if (/^coverimage\/\S{1,200}$/.test(v)) return `https://public-platform.r2.fish.audio/${v}`;
  return '';
}

// First training-sample audio URL, when present. The picker plays this
// for audition instead of spending a synthesis call.
function cleanSampleAudio(value) {
  if (!Array.isArray(value)) return '';
  for (const s of value) {
    if (s && typeof s.audio === 'string' && /^https?:\/\/\S{1,500}$/.test(s.audio.trim())) return s.audio.trim();
  }
  return '';
}

function cleanAuthor(value) {
  if (!value || typeof value !== 'object') return null;
  const nickname = cleanString(value.nickname, 100);
  const avatar = cleanUrl(value.avatar);
  if (!nickname && !avatar) return null;
  return { nickname, avatar };
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
    task_count: cleanNumber(item.task_count),
    like_count: cleanNumber(item.like_count),
    mark_count: cleanNumber(item.mark_count),
    shared_count: cleanNumber(item.shared_count),
    cover_image: cleanCoverUrl(item.cover_image),
    sample_audio: cleanSampleAudio(item.samples),
    author: cleanAuthor(item.author),
    created_at: cleanString(item.created_at, 40),
    state: cleanString(item.state, 20),
    visibility: cleanString(item.visibility, 20),
    liked: item.liked === true,
    marked: item.marked === true
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
  params.set('sort_by', sortBy === 'task_count' || sortBy === 'created_at' ? sortBy : 'score');
  const title = cleanString(url.searchParams.get('q'), 200);
  if (title) params.set('title', title);
  const language = cleanString(url.searchParams.get('language'), 20);
  if (language) params.set('language', language);
  const tag = cleanString(url.searchParams.get('tag'), 40);
  if (tag) params.set('tag', tag);
  if (url.searchParams.get('licensed') === 'true') params.set('licensed', 'true');
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
