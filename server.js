'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');

const PORT = Number.parseInt(process.env.PORT || '3000', 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const FISH_URL = 'https://api.fish.audio/v1/tts';
const MIMO_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
// Free-tier model. Change this constant if Fish Audio retires s2.1-pro-free.
const FISH_MODEL = 's2.1-pro-free';
const MIMO_DEFAULT_MODEL = 'mimo-v2.5-tts';

const MAX_TEXT = 5000;
const MAX_BODY = 2 * 1024 * 1024;
const MAX_UPSTREAM_BYTES = 64 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 180000;

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:; " +
    "media-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; " +
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY'
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

const PAGE_ROUTES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/settings': 'settings.html',
  '/settings.html': 'settings.html'
};

function sendJson(res, status, data) {
  if (res.writableEnded) return;
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, status, body, contentType) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        const err = new Error('payload_too_large');
        err.statusCode = 413;
        reject(err);
        return;
      }
      if (!chunks.length) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        const err = new Error('invalid_json');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getBearer(req) {
  const auth = req.headers.authorization;
  return typeof auth === 'string' && /^Bearer\s+\S+/.test(auth) ? auth : null;
}

async function readLimited(response, limit) {
  const reader = response.body && response.body.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let out = '';
  let received = 0;
  try {
    while (received < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      out += decoder.decode(value, { stream: true });
    }
  } catch {
    // Ignore read errors while extracting a diagnostic message.
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
  }
  return out.slice(0, limit);
}

async function readCappedBuffer(response, limit) {
  const reader = response.body && response.body.getReader();
  if (!reader) return Buffer.alloc(0);

  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        const err = new Error('upstream_too_large');
        err.code = 'upstream_too_large';
        throw err;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
  }

  return Buffer.concat(chunks, total);
}

function extractErrorMessage(text) {
  if (!text) return '';
  try {
    const data = JSON.parse(text);
    const candidate = data?.error?.message || data?.error || data?.message || data?.detail;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 1000);
    if (candidate && typeof candidate === 'object') return JSON.stringify(candidate).slice(0, 1000);
  } catch {
    // Not JSON, fall through to raw text.
  }
  return text.trim().slice(0, 1000);
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

function handleUpstreamFetchError(res, err) {
  const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
  console.error('[proxy] upstream request failed:', (err && err.name) || 'Error');
  sendJson(res, timedOut ? 504 : 502, {
    error: timedOut ? 'upstream_timeout' : 'upstream_unreachable',
    detail: timedOut
      ? 'The upstream API took too long to respond.'
      : 'The upstream API could not be reached.'
  });
}

async function handleFish(req, res) {
  const auth = getBearer(req);
  if (!auth) {
    sendJson(res, 401, {
      error: 'missing_api_key',
      detail: 'Authorization: Bearer <FISH_API_KEY> is required.'
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, err.statusCode || 400, { error: err.message });
    return;
  }
  if (!body || typeof body !== 'object') {
    sendJson(res, 400, { error: 'invalid_body' });
    return;
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const referenceId = typeof body.reference_id === 'string' ? body.reference_id.trim() : '';

  if (!text) {
    sendJson(res, 400, { error: 'missing_text', detail: 'text is required.' });
    return;
  }
  if (text.length > MAX_TEXT) {
    sendJson(res, 400, {
      error: 'text_too_long',
      detail: `text must be at most ${MAX_TEXT} characters.`
    });
    return;
  }
  if (!referenceId) {
    sendJson(res, 400, {
      error: 'missing_reference_id',
      detail: 'reference_id is required for Fish Audio.'
    });
    return;
  }
  if (referenceId.length > 200) {
    sendJson(res, 400, { error: 'invalid_reference_id' });
    return;
  }

  const format = body.format === 'wav' ? 'wav' : 'mp3';
  const payload = { text, reference_id: referenceId, format };
  const prosody = normalizeProsody(body.prosody);
  if (prosody) payload.prosody = prosody;

  let upstream;
  try {
    upstream = await fetch(FISH_URL, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'audio/*',
        model: FISH_MODEL
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
  } catch (err) {
    handleUpstreamFetchError(res, err);
    return;
  }

  if (!upstream.ok) {
    const detail = extractErrorMessage(await readLimited(upstream, 4000));
    sendJson(res, upstream.status, {
      error: 'upstream_error',
      status: upstream.status,
      detail
    });
    return;
  }

  const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('json') || contentType.includes('text/html')) {
    const body = await readLimited(upstream, 4000);
    sendJson(res, 502, {
      error: 'upstream_error',
      detail: extractErrorMessage(body)
    });
    return;
  }

  let buffer;
  try {
    buffer = await readCappedBuffer(upstream, MAX_UPSTREAM_BYTES);
  } catch (err) {
    if (err && err.code === 'upstream_too_large') {
      sendJson(res, 502, { error: 'upstream_too_large' });
    } else {
      handleUpstreamFetchError(res, err);
    }
    return;
  }

  if (!buffer.length) {
    sendJson(res, 502, { error: 'empty_audio', detail: 'Fish Audio returned no audio.' });
    return;
  }

  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': contentType || (format === 'wav' ? 'audio/wav' : 'audio/mpeg'),
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
    'X-Audio-Format': format
  });
  res.end(buffer);
}

const FISH_MODELS_URL = 'https://api.fish.audio/model';

function clampQueryInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanQueryString(value, maxLen) {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}

function normalizeVoiceItem(item) {
  if (!item || typeof item !== 'object') return null;
  const id = cleanQueryString(item._id || item.id, 200);
  if (!id) return null;
  const list = (value) => (Array.isArray(value)
    ? value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim().slice(0, 40)).slice(0, 20)
    : []);
  const count = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const url = (value) => (typeof value === 'string' && /^https?:\/\/\S{1,500}$/.test(value.trim()) ? value.trim() : '');
  // Fish returns cover_image as a relative R2 path ("coverimage/<hash>"),
  // not a full URL. Verified 2026-11-02: public-platform.r2.fish.audio
  // serves it as image/jpeg.
  const coverUrl = (value) => {
    if (typeof value !== 'string') return '';
    const v = value.trim();
    if (/^https?:\/\/\S{1,500}$/.test(v)) return v;
    if (/^coverimage\/\S{1,200}$/.test(v)) return `https://public-platform.r2.fish.audio/${v}`;
    return '';
  };
  // First training-sample audio URL, when present. The picker plays this
  // for audition instead of spending a synthesis call.
  const sampleAudio = (value) => {
    if (!Array.isArray(value)) return '';
    for (const s of value) {
      if (s && typeof s.audio === 'string' && /^https?:\/\/\S{1,500}$/.test(s.audio.trim())) return s.audio.trim();
    }
    return '';
  };
  const author = item.author && typeof item.author === 'object'
    ? {
      nickname: cleanQueryString(item.author.nickname, 100),
      avatar: url(item.author.avatar)
    }
    : null;
  return {
    id,
    title: cleanQueryString(item.title, 200),
    description: cleanQueryString(item.description, 500),
    languages: list(item.languages),
    tags: list(item.tags),
    task_count: count(item.task_count),
    like_count: count(item.like_count),
    mark_count: count(item.mark_count),
    shared_count: count(item.shared_count),
    cover_image: coverUrl(item.cover_image),
    sample_audio: sampleAudio(item.samples),
    author: author && (author.nickname || author.avatar) ? author : null,
    created_at: cleanQueryString(item.created_at, 40),
    state: cleanQueryString(item.state, 20),
    visibility: cleanQueryString(item.visibility, 20),
    liked: item.liked === true,
    marked: item.marked === true
  };
}

// GET /api/voices — Node mirror of functions/api/voices.js. Keep both in
// sync: same query params, same normalized response shape.
async function handleVoices(req, res) {
  const auth = getBearer(req);
  if (!auth) {
    sendJson(res, 401, {
      error: 'missing_api_key',
      detail: 'Authorization: Bearer <FISH_API_KEY> is required.'
    });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const params = new URLSearchParams();
  params.set('page_size', String(clampQueryInt(url.searchParams.get('page_size'), 20, 1, 50)));
  params.set('page_number', String(clampQueryInt(url.searchParams.get('page_number'), 1, 1, 1000)));
  const sortBy = url.searchParams.get('sort_by');
  params.set('sort_by', sortBy === 'task_count' || sortBy === 'created_at' ? sortBy : 'score');
  const title = cleanQueryString(url.searchParams.get('q'), 200);
  if (title) params.set('title', title);
  const language = cleanQueryString(url.searchParams.get('language'), 20);
  if (language) params.set('language', language);
  const tag = cleanQueryString(url.searchParams.get('tag'), 40);
  if (tag) params.set('tag', tag);
  if (url.searchParams.get('licensed') === 'true') params.set('licensed', 'true');
  if (url.searchParams.get('scope') === 'mine') params.set('self', 'true');

  let upstream;
  try {
    upstream = await fetch(`${FISH_MODELS_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: auth, Accept: 'application/json' },
      // Short timeout: a voice list should answer in seconds. Kept well
      // under the platform's wall-clock limit so a slow upstream still
      // yields a clean 504 JSON instead of a dropped connection.
      signal: AbortSignal.timeout(15000)
    });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    sendJson(res, timedOut ? 504 : 502, {
      error: timedOut ? 'upstream_timeout' : 'upstream_unreachable',
      detail: timedOut ? 'The upstream API took too long to respond.' : 'The upstream API could not be reached.'
    });
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    sendJson(res, upstream.status, { error: 'upstream_error', status: upstream.status, detail: text.slice(0, 1000) });
    return;
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    sendJson(res, 502, { error: 'upstream_error', detail: 'Fish Audio returned an unreadable voice list.' });
    return;
  }

  const items = Array.isArray(data?.items) ? data.items.map(normalizeVoiceItem).filter(Boolean) : [];
  const total = Number(data?.total);
  sendJson(res, 200, { total: Number.isFinite(total) && total >= 0 ? Math.floor(total) : items.length, items });
}

async function handleMimo(req, res) {
  const auth = getBearer(req);
  if (!auth) {
    sendJson(res, 401, {
      error: 'missing_api_key',
      detail: 'Authorization: Bearer <MIMO_API_KEY> is required.'
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, err.statusCode || 400, { error: err.message });
    return;
  }
  if (!body || typeof body !== 'object') {
    sendJson(res, 400, { error: 'invalid_body' });
    return;
  }

  const model =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : MIMO_DEFAULT_MODEL;
  if (model.length > 100) {
    sendJson(res, 400, { error: 'invalid_model', detail: 'model ID must be at most 100 characters.' });
    return;
  }

  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 4) {
    sendJson(res, 400, { error: 'invalid_messages' });
    return;
  }

  const messages = [];
  let totalChars = 0;
  for (const message of body.messages) {
    if (!message || typeof message.role !== 'string' || typeof message.content !== 'string') {
      sendJson(res, 400, { error: 'invalid_messages' });
      return;
    }
    const role = ['user', 'assistant', 'system'].includes(message.role) ? message.role : 'user';
    const content = message.content.trim();
    if (!content) {
      sendJson(res, 400, { error: 'invalid_messages' });
      return;
    }
    totalChars += content.length;
    messages.push({ role, content });
  }
  if (totalChars > MAX_TEXT + 600) {
    sendJson(res, 400, { error: 'text_too_long', detail: `messages must total at most ${MAX_TEXT + 600} characters.` });
    return;
  }

  const audio = body.audio && typeof body.audio === 'object' ? body.audio : {};
  const voice = typeof audio.voice === 'string' && audio.voice.trim()
    ? audio.voice.trim().slice(0, 60)
    : '冰糖';
  const format = audio.format === 'mp3' ? 'mp3' : 'wav';

  let upstream;
  try {
    upstream = await fetch(MIMO_URL, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        audio: { format, voice }
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
  } catch (err) {
    handleUpstreamFetchError(res, err);
    return;
  }

  if (!upstream.ok) {
    const detail = extractErrorMessage(await readLimited(upstream, 4000));
    sendJson(res, upstream.status, {
      error: 'upstream_error',
      status: upstream.status,
      detail
    });
    return;
  }

  let raw;
  try {
    const buffer = await readCappedBuffer(upstream, MAX_UPSTREAM_BYTES);
    raw = buffer.toString('utf8');
  } catch (err) {
    if (err && err.code === 'upstream_too_large') {
      sendJson(res, 502, { error: 'upstream_too_large' });
    } else {
      handleUpstreamFetchError(res, err);
    }
    return;
  }

  try {
    JSON.parse(raw);
  } catch {
    sendJson(res, 502, { error: 'upstream_error', detail: 'MiMo returned invalid JSON.' });
    return;
  }

  sendText(res, 200, raw, 'application/json; charset=utf-8');
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  let relative = PAGE_ROUTES[pathname];
  if (!relative) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      sendJson(res, 400, { error: 'bad_path' });
      return;
    }
    relative = decoded.replace(/^\/+/, '');
  }

  if (!relative || relative.includes('\0')) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }
  if (!stat.isFile()) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache'
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal_error' });
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = url.pathname;
  } catch {
    sendJson(res, 400, { error: 'bad_url' });
    return;
  }

  try {
    if (pathname === '/api/health') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      sendJson(res, 200, { ok: true, fishModel: FISH_MODEL, mimoDefaultModel: MIMO_DEFAULT_MODEL });
      return;
    }

    if (pathname === '/api/fish') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      await handleFish(req, res);
      return;
    }

    if (pathname === '/api/mimo') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      await handleMimo(req, res);
      return;
    }

    if (pathname === '/api/voices') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      await handleVoices(req, res);
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[server] unhandled error:', (err && err.message) || 'unknown');
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal_error' });
    } else {
      res.destroy();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TTS is free running at http://localhost:${PORT}`);
  console.log(`Proxy targets: ${FISH_URL} (model: ${FISH_MODEL}), ${MIMO_URL}`);
});
