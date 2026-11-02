import {
  DEFAULT_FISH_VOICES,
  DEFAULT_PREFS,
  HISTORY_LIMIT,
  MAX_CHARS,
  MIMO_DEFAULT_MODEL,
  MIMO_VOICES
} from './config.js';

const SETTINGS_KEY = 'tts_free_settings_v1';
const HISTORY_KEY = 'tts_free_history_v1';
const PREFS_KEY = 'tts_free_prefs_v1';
const VOICES_KEY = 'tts_free_voices_v1';
const FAVORITES_KEY = 'tts_free_favorites_v1';
const VOICE_TITLES_KEY = 'tts_free_voice_titles_v1';
const DRAFT_KEY = 'tts_free_draft_v1';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `tts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getSettings() {
  const raw = readJSON(SETTINGS_KEY, {});
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    fishKey: typeof source.fishKey === 'string' ? source.fishKey : '',
    mimoKey: typeof source.mimoKey === 'string' ? source.mimoKey : '',
    mimoModel:
      typeof source.mimoModel === 'string' && source.mimoModel.trim()
        ? source.mimoModel.trim()
        : MIMO_DEFAULT_MODEL
  };
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeJSON(SETTINGS_KEY, next);
  return next;
}

export function clearKeys() {
  return saveSettings({ fishKey: '', mimoKey: '' });
}

export function hasKey(engine) {
  const settings = getSettings();
  return engine === 'fish' ? Boolean(settings.fishKey) : Boolean(settings.mimoKey);
}

export function getPrefs() {
  const raw = readJSON(PREFS_KEY, {});
  const source = raw && typeof raw === 'object' ? raw : {};
  const merged = { ...DEFAULT_PREFS, ...source };
  return {
    engine: merged.engine === 'mimo' ? 'mimo' : 'fish',
    fishRef: typeof merged.fishRef === 'string' ? merged.fishRef : '',
    mimoVoice: MIMO_VOICES.includes(merged.mimoVoice) ? merged.mimoVoice : DEFAULT_PREFS.mimoVoice,
    speed: clampNumber(merged.speed, 0.5, 2, DEFAULT_PREFS.speed),
    volume: clampNumber(merged.volume, 10, 200, DEFAULT_PREFS.volume),
    formatFish: merged.formatFish === 'wav' ? 'wav' : 'mp3',
    formatMimo: merged.formatMimo === 'mp3' ? 'mp3' : 'wav'
  };
}

export function savePrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  try {
    writeJSON(PREFS_KEY, next);
  } catch {
    // Preferences are non-critical.
  }
  return next;
}

export function getFishVoices() {
  const raw = readJSON(VOICES_KEY, null);
  if (raw === null) return DEFAULT_FISH_VOICES.map((voice) => ({ ...voice }));
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((voice) => voice && typeof voice.id === 'string' && voice.id.trim())
    .map((voice) => ({
      id: voice.id.trim(),
      name: typeof voice.name === 'string' ? voice.name.trim() : '',
      official: Boolean(voice.official)
    }));
}

export function saveFishVoices(voices) {
  writeJSON(VOICES_KEY, voices);
  return voices;
}

export function addFishVoice({ name, id }) {
  const voices = getFishVoices();
  const cleanId = String(id || '').trim();
  if (!cleanId) return { voices, added: false, duplicate: false };
  if (voices.some((voice) => voice.id === cleanId)) {
    return { voices, added: false, duplicate: true };
  }
  const next = [...voices, { id: cleanId, name: String(name || '').trim() }];
  saveFishVoices(next);
  return { voices: next, added: true, duplicate: false };
}

export function removeFishVoice(id) {
  const next = getFishVoices().filter((voice) => voice.id !== id);
  saveFishVoices(next);
  return next;
}

export function getHistory() {
  const raw = readJSON(HISTORY_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
    .slice(0, HISTORY_LIMIT)
    .map((entry) => ({
      ...entry,
      audio: typeof entry.audio === 'string' && entry.audio.startsWith('data:') ? entry.audio : null,
      audioDropped: Boolean(entry.audioDropped)
    }));
}

export function saveHistoryEntry(entry) {
  const items = [entry, ...getHistory().filter((item) => item.id !== entry.id)].slice(
    0,
    HISTORY_LIMIT
  );
  let droppedAudio = false;

  for (let attempt = 0; attempt <= items.length; attempt += 1) {
    try {
      writeJSON(HISTORY_KEY, items);
      return { items, droppedAudio };
    } catch {
      let audioIndex = -1;
      for (let i = items.length - 1; i >= 0; i -= 1) {
        if (items[i].audio) {
          audioIndex = i;
          break;
        }
      }
      if (audioIndex === -1) throw new Error('history_storage_failed');
      items[audioIndex] = { ...items[audioIndex], audio: null, audioDropped: true };
      droppedAudio = true;
    }
  }

  throw new Error('history_storage_failed');
}

export function removeHistoryEntry(id) {
  const items = getHistory().filter((entry) => entry.id !== id);
  writeJSON(HISTORY_KEY, items);
  return items;
}

// Flip a still-pending entry back to a plain text-only record (used when a
// synthesis is aborted or fails: the text stays in history, reusable, but
// no longer claims to be in progress). No-op when the entry was already
// replaced by its completed version or never existed.
export function clearPendingHistoryEntry(id) {
  const items = getHistory();
  const target = items.find((entry) => entry.id === id);
  if (!target || !target.pending) return false;
  writeJSON(
    HISTORY_KEY,
    items.map((entry) => (entry.id === id ? { ...entry, pending: false } : entry))
  );
  return true;
}

export function clearHistory() {
  writeJSON(HISTORY_KEY, []);
}

// The in-progress textarea draft: saved on every keystroke, restored on
// load, so a refresh never eats typed text — even text never synthesized.
export function getDraftText() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return typeof raw === 'string' ? raw.slice(0, MAX_CHARS) : '';
  } catch {
    return '';
  }
}

export function saveDraftText(text) {
  try {
    localStorage.setItem(DRAFT_KEY, typeof text === 'string' ? text.slice(0, MAX_CHARS) : '');
  } catch {
    // Ignore storage failures (private mode, quota): the draft is a
    // convenience, never a blocker.
  }
}

export function clearAllLocalData() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(PREFS_KEY);
    localStorage.removeItem(VOICES_KEY);
    localStorage.removeItem(FAVORITES_KEY);
    localStorage.removeItem(VOICE_TITLES_KEY);
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/* ---------- voice favorites + title map + recent use ---------- */

function cleanVoiceSnapshot(voice) {
  if (!voice || typeof voice.id !== 'string' || !voice.id.trim()) return null;
  const out = { id: voice.id.trim() };
  if (typeof voice.title === 'string' && voice.title.trim()) out.title = voice.title.trim().slice(0, 200);
  if (typeof voice.description === 'string' && voice.description.trim()) {
    out.description = voice.description.trim().slice(0, 500);
  }
  if (Array.isArray(voice.languages)) out.languages = voice.languages.filter((v) => typeof v === 'string').slice(0, 20);
  if (Array.isArray(voice.tags)) out.tags = voice.tags.filter((v) => typeof v === 'string').slice(0, 20);
  for (const field of ['task_count', 'like_count', 'mark_count']) {
    if (typeof voice[field] === 'number' && Number.isFinite(voice[field])) out[field] = Math.floor(voice[field]);
  }
  if (typeof voice.cover_image === 'string' && /^https?:\/\/\S{1,500}$/.test(voice.cover_image.trim())) {
    out.cover_image = voice.cover_image.trim();
  }
  if (typeof voice.sample_audio === 'string' && /^https?:\/\/\S{1,500}$/.test(voice.sample_audio.trim())) {
    out.sample_audio = voice.sample_audio.trim();
  }
  if (voice.author && typeof voice.author === 'object') {
    const author = {};
    if (typeof voice.author.nickname === 'string' && voice.author.nickname.trim()) {
      author.nickname = voice.author.nickname.trim().slice(0, 100);
    }
    if (typeof voice.author.avatar === 'string' && /^https?:\/\/\S{1,500}$/.test(voice.author.avatar.trim())) {
      author.avatar = voice.author.avatar.trim();
    }
    if (author.nickname || author.avatar) out.author = author;
  }
  return out;
}

export function getFavorites() {
  const raw = readJSON(FAVORITES_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(cleanVoiceSnapshot).filter(Boolean);
}

export function isFavorite(id) {
  return getFavorites().some((voice) => voice.id === id);
}

export function toggleFavorite(voice) {
  const clean = cleanVoiceSnapshot(voice);
  if (!clean) return { favorites: getFavorites(), added: false };
  const current = getFavorites();
  if (current.some((item) => item.id === clean.id)) {
    const next = current.filter((item) => item.id !== clean.id);
    writeJSON(FAVORITES_KEY, next);
    return { favorites: next, added: false };
  }
  const next = [clean, ...current].slice(0, 200);
  writeJSON(FAVORITES_KEY, next);
  return { favorites: next, added: true };
}

export function saveVoiceTitle(id, title) {
  if (typeof id !== 'string' || !id.trim() || typeof title !== 'string' || !title.trim()) return;
  const map = readJSON(VOICE_TITLES_KEY, {});
  const next = map && typeof map === 'object' ? { ...map } : {};
  next[id.trim()] = title.trim().slice(0, 200);
  try {
    writeJSON(VOICE_TITLES_KEY, next);
  } catch {
    // Titles are non-critical.
  }
}

export function getVoiceTitle(id) {
  const map = readJSON(VOICE_TITLES_KEY, {});
  if (!map || typeof map !== 'object') return '';
  const title = map[id];
  return typeof title === 'string' ? title : '';
}

// Recently used Fish voices, newest first, derived from synthesis history.
export function getRecentFishVoices() {
  const seen = new Set();
  const out = [];
  for (const entry of getHistory()) {
    if (entry.engine !== 'fish' || typeof entry.voice !== 'string' || !entry.voice.trim()) continue;
    const id = entry.voice.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title: getVoiceTitle(id) });
  }
  return out;
}
