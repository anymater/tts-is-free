import { API } from './config.js';

export class SynthesisError extends Error {
  constructor(code, { status = 0, detail = '', cause = null } = {}) {
    super(code);
    this.name = 'SynthesisError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.cause = cause;
  }
}

/* ---------- 官方额度状态（响应头 X-Official-Quota-* 的唯一出口） ----------
   代理只在“官方模式”（请求不带 Authorization）时回传这两个头；自定义模式
   没有头 → lastOfficialQuota 保持 null，app.js 据此区分两种模式。 */
let lastOfficialQuota = null;
let quotaListener = null;

export function getOfficialQuota() {
  return lastOfficialQuota;
}

// app.js 注册回调：任何一次 API 响应带回额度头都会触发刷新指示器。
export function onOfficialQuotaUpdate(listener) {
  quotaListener = typeof listener === 'function' ? listener : null;
}

function applyQuotaHeaders(headers) {
  if (!headers) return;
  const limit = Number(headers.get('X-Official-Quota-Limit'));
  const remaining = Number(headers.get('X-Official-Quota-Remaining'));
  if (!Number.isFinite(limit) || !Number.isFinite(remaining)) return;
  lastOfficialQuota = { limit, remaining, ts: Date.now() };
  if (quotaListener) quotaListener(lastOfficialQuota);
}

// 服务端专用的错误码（官方模式不可用/超额），优先于 HTTP 状态码映射。
const SERVER_ERROR_CODES = new Set([
  'official_quota_exceeded',
  'official_key_missing',
  'official_quota_unavailable'
]);

function mapStatus(status, engine) {
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 402 || status === 429) return 'quota';
  if (status === 504) return 'timeout';
  if (status === 404) return engine === 'mimo' ? 'model' : 'bad_request';
  if (status >= 500) return 'server';
  return 'bad_request';
}

async function readErrorPayload(response) {
  const text = await response.text().catch(() => '');
  let serverCode = '';
  let detail = '';
  if (text) {
    try {
      const data = JSON.parse(text);
      if (typeof data?.error === 'string' && SERVER_ERROR_CODES.has(data.error)) serverCode = data.error;
      const candidate = data?.detail || data?.error?.message || data?.error || data?.message;
      if (typeof candidate === 'string') detail = candidate.slice(0, 600);
      else if (candidate && typeof candidate === 'object') detail = JSON.stringify(candidate).slice(0, 600);
    } catch {
      detail = text.slice(0, 600);
    }
  }
  return { serverCode, detail };
}

async function requestJson(path, key, payload, signal, engine) {
  const headers = { 'Content-Type': 'application/json' };
  // 有 Key → 自定义模式；没有 Key 就不带 Authorization，由代理走官方模式。
  if (key) headers.Authorization = `Bearer ${key}`;

  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify(payload)
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new SynthesisError('network', { cause: err });
  }

  applyQuotaHeaders(response.headers);

  if (!response.ok) {
    const { serverCode, detail } = await readErrorPayload(response);
    throw new SynthesisError(serverCode || mapStatus(response.status, engine), {
      status: response.status,
      detail
    });
  }

  return response;
}

export async function synthesizeFish({ text, referenceId, format, speed, volumeDb, key, signal }) {
  const payload = {
    text,
    reference_id: referenceId,
    format
  };

  if (Math.abs(speed - 1) > 0.001 || Math.abs(volumeDb) > 0.01) {
    payload.prosody = {
      speed: Math.round(speed * 100) / 100,
      volume: Math.round(volumeDb * 10) / 10
    };
  }

  const response = await requestJson(API.fish, key, payload, signal, 'fish');
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const rawBlob = await response.blob();

  if (!rawBlob.size) throw new SynthesisError('empty_audio');

  const mime = contentType.startsWith('audio/')
    ? contentType.split(';')[0]
    : format === 'wav'
      ? 'audio/wav'
      : 'audio/mpeg';
  const blob = rawBlob.type === mime ? rawBlob : new Blob([rawBlob], { type: mime });

  return { blob, mime, format, engine: 'fish' };
}

export function buildMimoInstruction({ speed, volumePercent, lang }) {
  const speedChanged = Math.abs(speed - 1) >= 0.01;
  const volumeChanged = Math.abs(volumePercent - 100) >= 1;
  if (!speedChanged && !volumeChanged) return '';

  if (lang === 'zh') {
    const pieces = [];
    if (speedChanged) {
      const speedText = speed < 1 ? '稍慢' : speed > 1 ? '稍快' : '正常';
      pieces.push(`语速${speedText}（约 ${speed.toFixed(1)} 倍）`);
    }
    if (volumeChanged) {
      const volumeText = volumePercent < 100 ? '稍小' : volumePercent > 100 ? '稍大' : '正常';
      pieces.push(`音量${volumeText}`);
    }
    return `请用${pieces.join('、')}朗读下面的内容。`;
  }

  const pieces = [];
  if (speedChanged) pieces.push(`about ${speed.toFixed(1)}x speed`);
  if (volumeChanged) {
    pieces.push(volumePercent < 100 ? 'a softer volume' : volumePercent > 100 ? 'a louder volume' : 'normal volume');
  }
  return `Read the following text at ${pieces.join(' and ')}.`;
}

function base64ToBytes(base64) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    throw new SynthesisError('bad_audio', { cause: err });
  }
}

function sniffMime(bytes) {
  if (bytes.length >= 12) {
    const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    if (riff) return 'audio/wav';
  }
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'audio/mpeg';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'audio/ogg';
  }
  return null;
}

export async function synthesizeMimo({
  text,
  voice,
  format,
  model,
  key,
  instruction,
  signal
}) {
  const messages = [];
  if (instruction) messages.push({ role: 'user', content: instruction });
  messages.push({ role: 'assistant', content: text });

  const response = await requestJson(
    API.mimo,
    key,
    { model, messages, audio: { format, voice } },
    signal,
    'mimo'
  );

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new SynthesisError('bad_audio', { cause: err });
  }

  const audioField = data?.choices?.[0]?.message?.audio;
  const base64 =
    typeof audioField === 'string'
      ? audioField
      : typeof audioField?.data === 'string'
        ? audioField.data
        : '';

  if (!base64) {
    const detail =
      data?.error?.message ||
      data?.error ||
      data?.choices?.[0]?.message?.content ||
      '';
    throw new SynthesisError('empty_audio', {
      detail: typeof detail === 'string' ? detail.slice(0, 600) : ''
    });
  }

  const clean = base64.replace(/^data:[^,]+,/, '').replace(/\s+/g, '').trim();
  const bytes = base64ToBytes(clean);
  if (!bytes.length) throw new SynthesisError('empty_audio');

  const mime = sniffMime(bytes) || (format === 'wav' ? 'audio/wav' : 'audio/mpeg');
  const actualFormat = mime.includes('wav') ? 'wav' : mime.includes('ogg') ? 'ogg' : 'mp3';
  const blob = new Blob([bytes], { type: mime });

  return { blob, mime, format: actualFormat, engine: 'mimo' };
}

export async function fetchFishVoices({ key, scope = 'public', language = '', query = '', tag = '', licensed = false, sortBy = 'score', pageSize = 30, pageNumber = 1, signal } = {}) {
  const params = new URLSearchParams();
  params.set('scope', scope === 'mine' ? 'mine' : 'public');
  params.set('page_size', String(Math.min(50, Math.max(1, pageSize || 30))));
  params.set('page_number', String(Math.max(1, pageNumber || 1)));
  params.set('sort_by', ['task_count', 'created_at'].includes(sortBy) ? sortBy : 'score');
  if (language) params.set('language', language);
  if (query) params.set('q', query);
  if (tag) params.set('tag', tag);
  if (licensed) params.set('licensed', 'true');

  let response;
  try {
    const headers = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    response = await fetch(`${API.voices}?${params.toString()}`, { method: 'GET', signal, headers });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new SynthesisError('network', { cause: err });
  }

  if (!response.ok) {
    const { serverCode, detail } = await readErrorPayload(response);
    throw new SynthesisError(serverCode || mapStatus(response.status, 'fish'), {
      status: response.status,
      detail
    });
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new SynthesisError('bad_audio', { cause: err });
  }

  const items = Array.isArray(data?.items) ? data.items.filter((item) => item && typeof item.id === 'string') : [];
  // official=true 表示这次列表是代理用官方 Key 取的（用户没填自己的 Key）。
  return { total: typeof data?.total === 'number' ? data.total : items.length, items, official: !key };
}

export async function checkProxy() {
  try {
    const response = await fetch(API.health, { cache: 'no-store' });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

export function volumePercentToDb(percent) {
  if (percent <= 0) return -20;
  const db = 20 * Math.log10(percent / 100);
  return Math.max(-20, Math.min(20, db));
}
