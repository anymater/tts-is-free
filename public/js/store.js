import {
  DEFAULT_FISH_VOICES,
  DEFAULT_PREFS,
  HISTORY_LIMIT,
  MIMO_DEFAULT_MODEL,
  MIMO_VOICES
} from './config.js';

const SETTINGS_KEY = 'tts_free_settings_v1';
const HISTORY_KEY = 'tts_free_history_v1';
const PREFS_KEY = 'tts_free_prefs_v1';
const VOICES_KEY = 'tts_free_voices_v1';

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

export function clearHistory() {
  writeJSON(HISTORY_KEY, []);
}

export function clearAllLocalData() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(PREFS_KEY);
    localStorage.removeItem(VOICES_KEY);
  } catch {
    // Ignore storage failures.
  }
}
