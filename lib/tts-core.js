'use strict';

// CLI 与 MCP 共用的合成核心：零依赖，只用 Node 内置 fetch。
// 与 server.js / 前端保持一致的上游形态：
//   Fish: POST https://api.fish.audio/v1/tts，头 Authorization + model，
//         体 {text, reference_id, format}，可选 prosody {speed, volume(分贝)}，
//         返回原始音频字节。
//   MiMo: POST https://api.xiaomimemo.com/v1/chat/completions，
//         体 {model, messages, audio: {format, voice}}，
//         音频在 choices[0].message.audio.data（base64）。
// Key 永不写进代码：调用方从环境变量或命令行显式传入。
// 仅供本地测试：TTS_FISH_TTS_URL / TTS_MIMO_URL / TTS_FISH_MODELS_URL
// 可覆盖上游地址（指向本地 mock），生产使用不要设置这三个变量。

const FISH_TTS_URL = process.env.TTS_FISH_TTS_URL || 'https://api.fish.audio/v1/tts';
const MIMO_URL = process.env.TTS_MIMO_URL || 'https://api.xiaomimemo.com/v1/chat/completions';
const FISH_MODELS_URL =
  process.env.TTS_FISH_MODELS_URL || 'https://api.fish.audio/model';

const FISH_MODEL = 's2.1-pro-free';
const MIMO_DEFAULT_MODEL = 'mimo-v2.5-tts';

const SYNTH_TIMEOUT_MS = 120000;
const LIST_TIMEOUT_MS = 15000;
const MAX_TEXT = 5000;

// 错误类型：message 直接可展示，status 为上游 HTTP 状态（无则为 0）。
class TtsError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'TtsError';
    this.status = status;
  }
}

// 音量百分比（10–200）转分贝，与前端 volumePercentToDb 一致。
function volumePercentToDb(percent) {
  if (percent <= 0) return -20;
  const db = 20 * Math.log10(percent / 100);
  return Math.max(-20, Math.min(20, db));
}

function validateCommon({ text, engine, format }) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new TtsError('缺少合成文本：请传入文本、--file 或通过 stdin 输入。');
  }
  if (text.length > MAX_TEXT) {
    throw new TtsError(`文本过长：最多 ${MAX_TEXT} 字符，当前 ${text.length} 字符。`);
  }
  if (engine !== 'fish' && engine !== 'mimo') {
    throw new TtsError(`不支持的引擎：${engine}（仅支持 fish / mimo）。`);
  }
  if (format !== 'mp3' && format !== 'wav') {
    throw new TtsError(`不支持的格式：${format}（仅支持 mp3 / wav）。`);
  }
}

function validateSpeedVolume(speed, volume) {
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw new TtsError(`语速超出范围：${speed}（允许 0.5–2）。`);
  }
  if (!Number.isFinite(volume) || volume < 10 || volume > 200) {
    throw new TtsError(`音量超出范围：${volume}（允许 10–200，即百分比）。`);
  }
}

async function readUpstreamError(response) {
  try {
    const text = await response.text();
    if (!text) return '';
    try {
      const data = JSON.parse(text);
      return data?.detail || data?.error?.message || data?.error || text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return '';
  }
}

// Fish 合成：返回 Buffer（原始音频字节）。
async function synthesizeFish({ text, referenceId, format, speed = 1, volume = 100, key }) {
  validateCommon({ text, engine: 'fish', format });
  validateSpeedVolume(speed, volume);
  if (!referenceId) {
    throw new TtsError('Fish 引擎需要音色 reference_id：请用 --voice 传入，或先在网站音色选择器里挑一个。');
  }
  if (!key) {
    throw new TtsError('缺少 Fish API Key：请设置环境变量 FISH_API_KEY，或用 --fish-key 传入。');
  }

  const payload = { text, reference_id: referenceId, format };
  const volumeDb = volumePercentToDb(volume);
  if (Math.abs(speed - 1) > 0.001 || Math.abs(volumeDb) > 0.01) {
    payload.prosody = {
      speed: Math.round(speed * 100) / 100,
      volume: Math.round(volumeDb * 10) / 10
    };
  }

  let response;
  try {
    response = await fetch(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'audio/*',
        model: FISH_MODEL
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS)
    });
  } catch (err) {
    throw new TtsError(`Fish 请求失败（网络或超时）：${err.message}`);
  }
  if (!response.ok) {
    const detail = await readUpstreamError(response);
    throw new TtsError(
      `Fish 合成失败（HTTP ${response.status}）：${detail || '请检查 Key 是否有效、额度是否充足。'}`,
      response.status
    );
  }
  const buf = Buffer.from(await response.arrayBuffer());
  if (!buf.length) throw new TtsError('Fish 返回了空音频。');
  return buf;
}

// MiMo 合成：返回 Buffer（base64 解码后的音频字节）。
async function synthesizeMimo({ text, voice, format, speed = 1, volume = 100, key, model }) {
  validateCommon({ text, engine: 'mimo', format });
  validateSpeedVolume(speed, volume);
  if (!key) {
    throw new TtsError('缺少 MiMo API Key：请设置环境变量 MIMO_API_KEY，或用 --mimo-key 传入。');
  }

  // 语速/音量变化时用一条指令消息告诉模型（与前端 buildMimoInstruction 同思路）。
  const messages = [];
  const speedChanged = Math.abs(speed - 1) >= 0.01;
  const volumeChanged = Math.abs(volume - 100) >= 1;
  if (speedChanged || volumeChanged) {
    const pieces = [];
    if (speedChanged) pieces.push(`Speak ${speed < 1 ? 'slightly slower' : 'slightly faster'} (about ${speed.toFixed(1)}x speed)`);
    if (volumeChanged) pieces.push(`Speak ${volume < 100 ? 'more quietly' : 'more loudly'}`);
    messages.push({ role: 'user', content: pieces.join('. ') + '.' });
  }
  messages.push({ role: 'assistant', content: text });

  let response;
  try {
    response = await fetch(MIMO_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model: model || MIMO_DEFAULT_MODEL,
        messages,
        audio: { format, voice: voice || '' }
      }),
      signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS)
    });
  } catch (err) {
    throw new TtsError(`MiMo 请求失败（网络或超时）：${err.message}`);
  }
  if (!response.ok) {
    const detail = await readUpstreamError(response);
    throw new TtsError(
      `MiMo 合成失败（HTTP ${response.status}）：${detail || '请检查 Key 是否有效、额度是否充足。'}`,
      response.status
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new TtsError('MiMo 返回了无法解析的响应。');
  }
  const audioField = data?.choices?.[0]?.message?.audio;
  const base64 =
    typeof audioField === 'string' ? audioField : typeof audioField?.data === 'string' ? audioField.data : '';
  if (!base64) {
    const detail =
      data?.error?.message || data?.error || data?.choices?.[0]?.message?.content || '';
    throw new TtsError(`MiMo 未返回音频数据。${detail ? `上游提示：${detail}` : ''}`);
  }
  return Buffer.from(base64, 'base64');
}

// 统一入口：按 engine 分发，返回 Buffer。
async function synthesize(options) {
  const engine = options.engine || 'fish';
  if (engine === 'fish') return synthesizeFish(options);
  if (engine === 'mimo') return synthesizeMimo(options);
  throw new TtsError(`不支持的引擎：${engine}（仅支持 fish / mimo）。`);
}

// Fish 音色列表：返回 { total, voices: [{ id, title, tags, task_count }] }。
async function listFishVoices({ key, language = '', tag = '', query = '', limit = 20 }) {
  if (!key) {
    throw new TtsError('缺少 Fish API Key：请设置环境变量 FISH_API_KEY。');
  }
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 20));
  const params = new URLSearchParams({ page_size: String(pageSize), page_number: '1' });
  if (language) params.set('language', language);
  if (tag) params.set('tag', tag);
  if (query) params.set('title', query);

  let response;
  try {
    response = await fetch(`${FISH_MODELS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS)
    });
  } catch (err) {
    throw new TtsError(`Fish 音色列表请求失败（网络或超时）：${err.message}`);
  }
  if (!response.ok) {
    const detail = await readUpstreamError(response);
    throw new TtsError(
      `Fish 音色列表失败（HTTP ${response.status}）：${detail || '请检查 Key 是否有效。'}`,
      response.status
    );
  }
  const data = await response.json().catch(() => ({}));
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    total: typeof data?.total === 'number' ? data.total : items.length,
    voices: items
      .filter((item) => item && (item._id || item.id))
      .map((item) => ({
        id: item._id || item.id,
        title: typeof item.title === 'string' ? item.title : '',
        tags: Array.isArray(item.tags) ? item.tags.filter((t) => typeof t === 'string') : [],
        task_count: Number.isFinite(Number(item.task_count)) ? Number(item.task_count) : 0
      }))
  };
}

module.exports = {
  TtsError,
  FISH_MODEL,
  MIMO_DEFAULT_MODEL,
  volumePercentToDb,
  synthesize,
  synthesizeFish,
  synthesizeMimo,
  listFishVoices
};
