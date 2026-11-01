import { HISTORY_LIMIT, MAX_CHARS, MIMO_VOICES } from './config.js';
import { applyI18n, formatDate, getLang, t, toggleLang } from './i18n.js';
import {
  addFishVoice,
  clearHistory,
  createId,
  getFishVoices,
  getHistory,
  getPrefs,
  getSettings,
  hasKey,
  removeHistoryEntry,
  saveHistoryEntry,
  savePrefs
} from './store.js';
import {
  SynthesisError,
  blobToDataUrl,
  buildMimoInstruction,
  checkProxy,
  fetchFishVoices,
  synthesizeFish,
  synthesizeMimo,
  volumePercentToDb
} from './api.js';

const $ = (id) => document.getElementById(id);

const langToggle = $('langToggle');
const textInput = $('textInput');
const charCount = $('charCount');
const engineFish = $('engineFish');
const engineMimo = $('engineMimo');
const fishVoiceBlock = $('fishVoiceBlock');
const mimoVoiceBlock = $('mimoVoiceBlock');
const fishRefInput = $('fishRefInput');
const fishPresets = $('fishPresets');
const fishVoiceSearch = $('fishVoiceSearch');
const fishVoiceStatus = $('fishVoiceStatus');
const fishVoiceList = $('fishVoiceList');
const fishVoicesRefresh = $('fishVoicesRefresh');
const savePresetBtn = $('savePresetBtn');
const mimoVoices = $('mimoVoices');
const speedRange = $('speedRange');
const speedValue = $('speedValue');
const volumeRange = $('volumeRange');
const volumeValue = $('volumeValue');
const formatSelect = $('formatSelect');
const keyNotice = $('keyNotice');
const keyNoticeText = $('keyNoticeText');
const proxyNotice = $('proxyNotice');
const synthBtn = $('synthBtn');
const synthBtnText = $('synthBtnText');
const synthIcon = $('synthIcon');
const synthSpinner = $('synthSpinner');
const cancelBtn = $('cancelBtn');
const resultCard = $('resultCard');
const resultEmpty = $('resultEmpty');
const resultBody = $('resultBody');
const resultError = $('resultError');
const resultErrorText = $('resultErrorText');
const errorDetailWrap = $('errorDetailWrap');
const errorDetail = $('errorDetail');
const audioPlayer = $('audioPlayer');
const playerShell = $('playerShell');
const resultEngine = $('resultEngine');
const resultVoice = $('resultVoice');
const resultFormat = $('resultFormat');
const resultSize = $('resultSize');
const downloadBtn = $('downloadBtn');
const historyList = $('historyList');
const historyEmpty = $('historyEmpty');
const historySubtitle = $('historySubtitle');
const clearHistoryBtn = $('clearHistoryBtn');
const toastHost = $('toastHost');

let prefs = getPrefs();
let loading = false;
let activeController = null;
let objectUrl = null;
let currentMeta = null;
let currentDownload = null;
let lastError = null;

/* ---------- small helpers ---------- */

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastHost.append(el);
  window.setTimeout(() => {
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), 220);
  }, 3300);
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function timestampSlug(ts) {
  const date = new Date(Number(ts) || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function extFor(meta) {
  const mime = String(meta.mime || '').toLowerCase();
  const format = String(meta.format || '').toLowerCase();
  if (mime.includes('wav') || format === 'wav') return 'wav';
  if (mime.includes('ogg') || format === 'ogg') return 'ogg';
  return 'mp3';
}

function filenameFor(meta, ts) {
  const engine = meta.engine === 'mimo' ? 'mimo' : 'fish';
  return `tts-${engine}-${timestampSlug(ts)}.${extFor(meta)}`;
}

function triggerDownload(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function setPlaying(playing) {
  const equalizer = playerShell.querySelector('.equalizer');
  if (equalizer) equalizer.classList.toggle('is-playing', playing);
}

/* ---------- rendering ---------- */

function renderSynthButton() {
  synthBtn.disabled = loading;
  synthBtn.classList.toggle('is-loading', loading);
  synthIcon.hidden = loading;
  synthSpinner.hidden = !loading;
  synthBtnText.textContent = t(loading ? 'synth.loading' : 'synth.button');
  cancelBtn.hidden = !loading;
  cancelBtn.disabled = !loading;
}

function setLoading(value) {
  loading = value;
  renderSynthButton();
}

function updateCharCount() {
  const count = textInput.value.length;
  charCount.textContent = t('text.count', { count, max: MAX_CHARS });
  charCount.classList.toggle('is-over', count >= MAX_CHARS);
}

function updateRangeOutputs() {
  speedValue.textContent = `${Number(speedRange.value).toFixed(1)}×`;
  volumeValue.textContent = `${Number(volumeRange.value)}%`;
}

function updateKeyNotice() {
  const configured = hasKey(prefs.engine);
  keyNotice.hidden = configured;
  if (!configured) {
    const engineName = t(prefs.engine === 'fish' ? 'engine.fish.name' : 'engine.mimo.name');
    keyNoticeText.textContent = t('notice.noKey', { engine: engineName });
  }
}

function updateHistorySubtitle() {
  historySubtitle.textContent = t('history.subtitle', { max: HISTORY_LIMIT });
}

function updateFishChipActive() {
  const current = fishRefInput.value.trim();
  fishPresets.querySelectorAll('.chip[data-id]').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.id === current);
  });
}

function renderFishPresets() {
  const voices = getFishVoices();
  fishPresets.replaceChildren();

  if (!voices.length) {
    const note = document.createElement('p');
    note.className = 'help';
    note.textContent = t('voice.noPresets');
    fishPresets.append(note);
    return;
  }

  const current = fishRefInput.value.trim();
  for (const voice of voices) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.id = voice.id;
    chip.title = voice.official ? t('voice.officialHint') : voice.id;
    if (voice.id === current) chip.classList.add('is-active');

    const dot = document.createElement('span');
    dot.className = 'chip-dot';
    const label = document.createElement('span');
    label.className = 'chip-name';
    label.textContent = voice.official
      ? t('voice.officialName')
      : voice.name || voice.id.slice(0, 10);

    chip.append(dot, label);
    fishPresets.append(chip);
  }
}

/* ---------- Fish voice picker (browse the Fish Audio library) ---------- */

let pickerScope = 'public';
let pickerQuery = '';
let pickerSeq = 0;
let pickerSearchTimer = null;
const pickerCache = new Map();

function pickerCacheKey(scope, query) {
  return `${scope}|${query}`;
}

function setPickerStatus(message) {
  if (message) {
    fishVoiceStatus.textContent = message;
    fishVoiceStatus.hidden = false;
  } else {
    fishVoiceStatus.textContent = '';
    fishVoiceStatus.hidden = true;
  }
}

function syncVoiceRowActive() {
  const current = fishRefInput.value.trim();
  fishVoiceList.querySelectorAll('.voice-row[data-id]').forEach((row) => {
    row.classList.toggle('is-active', row.dataset.id === current);
  });
}

function renderVoiceList(items) {
  fishVoiceList.replaceChildren();
  const current = fishRefInput.value.trim();

  for (const item of items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'voice-row';
    row.dataset.id = item.id;
    if (item.id === current) row.classList.add('is-active');

    const name = document.createElement('span');
    name.className = 'voice-row-name';
    name.textContent = item.title || item.id.slice(0, 12);

    const metaParts = [];
    if (Array.isArray(item.languages) && item.languages.length) {
      metaParts.push(item.languages.join(' · '));
    }
    if (typeof item.task_count === 'number') {
      metaParts.push(t('voice.picker.uses', { n: item.task_count }));
    }
    const meta = document.createElement('span');
    meta.className = 'voice-row-meta';
    meta.textContent = metaParts.join(' · ') || item.id;

    row.append(name, meta);
    if (item.description) {
      const desc = document.createElement('span');
      desc.className = 'voice-row-desc';
      desc.textContent = item.description;
      row.append(desc);
      row.title = item.description;
    }
    fishVoiceList.append(row);
  }
}

async function loadFishVoices({ force = false } = {}) {
  const settings = getSettings();
  if (!settings.fishKey) {
    fishVoiceList.replaceChildren();
    setPickerStatus(t('voice.picker.needKey'));
    return;
  }

  const key = pickerCacheKey(pickerScope, pickerQuery);
  if (!force && pickerCache.has(key)) {
    renderVoiceList(pickerCache.get(key));
    setPickerStatus(pickerCache.get(key).length ? '' : t('voice.picker.empty'));
    return;
  }

  const seq = ++pickerSeq;
  fishVoiceList.replaceChildren();
  setPickerStatus(t('voice.picker.loading'));

  try {
    let data = await fetchFishVoices({
      key: settings.fishKey,
      scope: pickerScope,
      query: pickerQuery,
      language: pickerScope === 'public' ? 'zh' : ''
    });
    // The zh filter is a guess at Fish's language code: if it yields
    // nothing, fall back to the unfiltered popular list instead of an
    // empty picker.
    if (pickerScope === 'public' && !data.items.length) {
      data = await fetchFishVoices({
        key: settings.fishKey,
        scope: pickerScope,
        query: pickerQuery,
        language: ''
      });
    }
    if (seq !== pickerSeq) return;
    pickerCache.set(key, data.items);
    renderVoiceList(data.items);
    setPickerStatus(data.items.length ? '' : t('voice.picker.empty'));
  } catch {
    if (seq !== pickerSeq) return;
    setPickerStatus(t('voice.picker.error'));
  }
}

function renderMimoVoices() {
  mimoVoices.replaceChildren();
  for (const voice of MIMO_VOICES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.voice = voice;
    if (voice === prefs.mimoVoice) chip.classList.add('is-active');

    const dot = document.createElement('span');
    dot.className = 'chip-dot';
    const label = document.createElement('span');
    label.className = 'chip-name';
    label.textContent = voice;

    chip.append(dot, label);
    mimoVoices.append(chip);
  }
}

function selectEngine(engine, { persist = false } = {}) {
  const next = engine === 'mimo' ? 'mimo' : 'fish';
  if (persist && next !== prefs.engine) {
    prefs = savePrefs({ engine: next });
  } else {
    prefs = { ...prefs, engine: next };
  }

  engineFish.setAttribute('aria-pressed', String(next === 'fish'));
  engineMimo.setAttribute('aria-pressed', String(next === 'mimo'));
  fishVoiceBlock.hidden = next !== 'fish';
  mimoVoiceBlock.hidden = next !== 'mimo';
  formatSelect.value = next === 'fish' ? prefs.formatFish : prefs.formatMimo;

  renderFishPresets();
  renderMimoVoices();
  if (next === 'fish') loadFishVoices();
  updateKeyNotice();
}

function fillResultMeta(meta) {
  if (!meta) return;
  resultEngine.textContent = t(meta.engine === 'mimo' ? 'engine.mimo.name' : 'engine.fish.name');
  resultVoice.textContent = meta.voice || '—';
  resultFormat.textContent = String(meta.format || extFor(meta)).toUpperCase();
  resultSize.textContent = formatBytes(meta.size);
}

function buildHistoryAction(action, entry, label, disabled) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button ghost small';
  button.dataset.action = action;
  button.dataset.id = entry.id;
  button.textContent = label;
  button.disabled = Boolean(disabled);
  return button;
}

function renderHistory() {
  const entries = getHistory();
  historyList.replaceChildren();
  historyEmpty.hidden = entries.length > 0;
  clearHistoryBtn.disabled = entries.length === 0;

  for (const entry of entries) {
    const item = document.createElement('article');
    item.className = 'history-item';

    const main = document.createElement('div');
    main.className = 'history-main';

    const top = document.createElement('div');
    top.className = 'history-top';

    const enginePill = document.createElement('span');
    enginePill.className = `engine-pill${entry.engine === 'mimo' ? ' mimo' : ''}`;
    enginePill.textContent = t(entry.engine === 'mimo' ? 'engine.mimo.name' : 'engine.fish.name');

    const voice = document.createElement('span');
    voice.className = 'history-voice';
    voice.textContent = entry.voice || '—';
    voice.title = entry.voice || '';

    const date = new Date(Number(entry.ts) || Date.now());
    const time = document.createElement('time');
    time.dateTime = date.toISOString();
    time.textContent = formatDate(date.getTime());

    top.append(enginePill, voice, time);

    if (!entry.audio) {
      const missing = document.createElement('span');
      missing.className = 'history-missing';
      missing.textContent = t('history.audioMissing');
      top.append(missing);
    }

    const text = document.createElement('p');
    text.className = 'history-text';
    text.textContent = entry.text || '';
    text.title = entry.text || '';

    main.append(top, text);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    actions.append(
      buildHistoryAction('play', entry, t('history.play'), !entry.audio),
      buildHistoryAction('download', entry, t('history.download'), !entry.audio),
      buildHistoryAction('reuse', entry, t('history.reuse'), false),
      buildHistoryAction('delete', entry, t('history.delete'), false)
    );

    item.append(main, actions);
    historyList.append(item);
  }
}

function renderError() {
  if (!lastError) return;
  const info = localizeError(lastError);
  resultErrorText.textContent = info.text;
  if (info.detail) {
    errorDetailWrap.hidden = false;
    errorDetail.textContent = info.detail;
  } else {
    errorDetailWrap.hidden = true;
    errorDetail.textContent = '';
  }
  resultError.hidden = false;
}

function localizeError(err) {
  const status = Number(err.status) || 0;
  const detail = String(err.detail || '').trim();
  const code = err.code || 'unknown';

  switch (code) {
    case 'invalid_key':
      return { text: t('errors.invalidKey', { status }), detail };
    case 'quota':
      return { text: t('errors.quota', { status }), detail };
    case 'model':
      return { text: t('errors.model', { status }), detail };
    case 'bad_request':
      if (prefs.engine === 'mimo' && detail && /model/i.test(detail)) {
        return { text: t('errors.model', { status }), detail };
      }
      return { text: t('errors.badRequest', { status }), detail };
    case 'network':
      return {
        text: t('errors.network'),
        detail: err.cause && err.cause.message ? String(err.cause.message) : ''
      };
    case 'timeout':
      return { text: t('errors.timeout'), detail: '' };
    case 'server':
      return { text: t('errors.server', { status }), detail };
    case 'empty_audio':
      return { text: t('errors.emptyAudio'), detail };
    case 'bad_audio':
      return { text: t('errors.badAudio'), detail };
    default:
      return { text: t('errors.unknown'), detail: detail || String(err.message || '') };
  }
}

function hideResultError() {
  lastError = null;
  resultError.hidden = true;
  errorDetailWrap.hidden = true;
  errorDetail.textContent = '';
  resultErrorText.textContent = '';
}

function showError(err) {
  lastError =
    err instanceof SynthesisError
      ? err
      : { code: 'unknown', status: 0, detail: err && err.message ? String(err.message) : '' };
  renderError();
  toast(resultErrorText.textContent, 'error');
}

/* ---------- results ---------- */

async function persistHistory(audio, meta) {
  let dataUrl = null;
  let dropped = false;
  try {
    dataUrl = await blobToDataUrl(audio.blob);
  } catch {
    dropped = true;
  }

  const entry = {
    id: createId(),
    ts: Date.now(),
    engine: meta.engine,
    voice: meta.voice || '',
    text: meta.text || '',
    speed: meta.speed,
    volume: meta.volume,
    format: meta.format,
    mime: audio.mime,
    size: audio.blob.size,
    audio: dataUrl,
    audioDropped: dropped
  };

  try {
    const result = saveHistoryEntry(entry);
    if (result.droppedAudio || dropped) toast(t('history.saveDropped'), 'info');
    renderHistory();
  } catch {
    toast(t('history.saveFailed'), 'error');
  }
}

function showResult(audio, meta) {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  objectUrl = URL.createObjectURL(audio.blob);

  setPlaying(false);
  audioPlayer.src = objectUrl;
  audioPlayer.load();

  resultEmpty.hidden = true;
  resultBody.hidden = false;
  hideResultError();

  currentMeta = { ...meta, size: audio.blob.size, mime: audio.mime, format: audio.format };
  fillResultMeta(currentMeta);
  currentDownload = {
    url: objectUrl,
    filename: filenameFor(currentMeta, Date.now())
  };

  audioPlayer.play().catch(() => {
    // Autoplay can be blocked; the native controls are still available.
  });

  persistHistory(audio, currentMeta);
}

function showHistoryEntry(entry) {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  setPlaying(false);
  audioPlayer.src = entry.audio;
  audioPlayer.load();

  resultEmpty.hidden = true;
  resultBody.hidden = false;
  hideResultError();

  currentMeta = {
    ...entry,
    size: Number(entry.size) || 0,
    mime: entry.mime || '',
    format: entry.format || extFor(entry)
  };
  fillResultMeta(currentMeta);
  currentDownload = {
    url: entry.audio,
    filename: filenameFor(entry, entry.ts)
  };

  audioPlayer.play().catch(() => {
    // Playback may require another click in some browsers.
  });
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function applyEntryToForm(entry) {
  const engine = entry.engine === 'mimo' ? 'mimo' : 'fish';
  const patch = { engine };

  if (engine === 'fish') {
    patch.fishRef = entry.voice || '';
    if (entry.format === 'wav') patch.formatFish = 'wav';
    else if (entry.format === 'mp3') patch.formatFish = 'mp3';
  } else {
    if (MIMO_VOICES.includes(entry.voice)) patch.mimoVoice = entry.voice;
    if (entry.format === 'wav') patch.formatMimo = 'wav';
    else if (entry.format === 'mp3') patch.formatMimo = 'mp3';
  }

  const speed = Number(entry.speed);
  if (Number.isFinite(speed)) patch.speed = Math.min(2, Math.max(0.5, speed));
  const volume = Number(entry.volume);
  if (Number.isFinite(volume)) patch.volume = Math.min(200, Math.max(10, volume));

  prefs = savePrefs(patch);
  textInput.value = entry.text || '';
  fishRefInput.value = prefs.fishRef;
  speedRange.value = String(prefs.speed);
  volumeRange.value = String(prefs.volume);
  updateCharCount();
  updateRangeOutputs();
  selectEngine(engine, { persist: false });
  formatSelect.value = engine === 'fish' ? prefs.formatFish : prefs.formatMimo;
  textInput.focus();
  toast(t('history.reused'), 'success');
}

/* ---------- synthesis ---------- */

async function handleSynthesize() {
  if (loading) return;

  hideResultError();

  const text = textInput.value.trim();
  if (!text) {
    toast(t('errors.noText'), 'error');
    textInput.focus();
    return;
  }
  if (text.length > MAX_CHARS) {
    toast(t('errors.tooLong', { max: MAX_CHARS }), 'error');
    return;
  }

  const engine = prefs.engine;
  const settings = getSettings();
  const key = engine === 'fish' ? settings.fishKey : settings.mimoKey;

  if (!key) {
    toast(t(engine === 'fish' ? 'errors.noFishKey' : 'errors.noMimoKey'), 'error');
    updateKeyNotice();
    return;
  }

  let referenceId = '';
  if (engine === 'fish') {
    referenceId = fishRefInput.value.trim();
    if (!referenceId) {
      toast(t('errors.noRef'), 'error');
      fishRefInput.focus();
      return;
    }
    prefs = savePrefs({ fishRef: referenceId });
    updateFishChipActive();
  }

  const speed = Number(speedRange.value);
  const volumePercent = Number(volumeRange.value);
  const format = formatSelect.value === 'wav' ? 'wav' : 'mp3';
  const voice = engine === 'fish' ? referenceId : prefs.mimoVoice;

  const controller = new AbortController();
  activeController = controller;
  setLoading(true);

  try {
    let audio;
    if (engine === 'fish') {
      audio = await synthesizeFish({
        text,
        referenceId,
        format,
        speed,
        volumeDb: volumePercentToDb(volumePercent),
        key,
        signal: controller.signal
      });
    } else {
      audio = await synthesizeMimo({
        text,
        voice: prefs.mimoVoice,
        format,
        model: settings.mimoModel,
        key,
        instruction: buildMimoInstruction({
          speed,
          volumePercent,
          lang: getLang()
        }),
        signal: controller.signal
      });
    }

    if (controller.signal.aborted) return;

    showResult(audio, {
      engine,
      voice,
      text,
      speed,
      volume: volumePercent,
      format: audio.format
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      toast(t('synth.canceled'), 'info');
      return;
    }
    showError(err);
  } finally {
    if (activeController === controller) activeController = null;
    setLoading(false);
  }
}

/* ---------- language & storage refresh ---------- */

function refreshLanguage() {
  applyI18n(document);
  updateCharCount();
  updateRangeOutputs();
  updateKeyNotice();
  updateHistorySubtitle();
  renderFishPresets();
  renderMimoVoices();
  renderHistory();
  if (currentMeta) fillResultMeta(currentMeta);
  if (lastError) renderError();
  renderSynthButton();
}

function syncFormFromPrefs() {
  fishRefInput.value = prefs.fishRef;
  speedRange.value = String(prefs.speed);
  volumeRange.value = String(prefs.volume);
  formatSelect.value = prefs.engine === 'fish' ? prefs.formatFish : prefs.formatMimo;
  updateRangeOutputs();
  updateFishChipActive();
}

function refreshFromStorage() {
  prefs = getPrefs();
  syncFormFromPrefs();
  selectEngine(prefs.engine, { persist: false });
  updateKeyNotice();
  renderHistory();
}

/* ---------- events ---------- */

engineFish.addEventListener('click', () => selectEngine('fish', { persist: true }));
engineMimo.addEventListener('click', () => selectEngine('mimo', { persist: true }));

langToggle.addEventListener('click', () => {
  toggleLang();
  refreshLanguage();
});

textInput.addEventListener('input', updateCharCount);

fishRefInput.addEventListener('input', () => {
  prefs = savePrefs({ fishRef: fishRefInput.value });
  updateFishChipActive();
  syncVoiceRowActive();
});

document.querySelectorAll('#fishVoicePicker .picker-tab[data-scope]').forEach((tab) => {
  tab.addEventListener('click', () => {
    if (pickerScope === tab.dataset.scope) return;
    pickerScope = tab.dataset.scope;
    document.querySelectorAll('#fishVoicePicker .picker-tab[data-scope]').forEach((other) => {
      other.classList.toggle('is-active', other === tab);
    });
    loadFishVoices();
  });
});

fishVoiceSearch.addEventListener('input', () => {
  window.clearTimeout(pickerSearchTimer);
  pickerSearchTimer = window.setTimeout(() => {
    pickerQuery = fishVoiceSearch.value.trim();
    loadFishVoices();
  }, 400);
});

fishVoicesRefresh.addEventListener('click', () => {
  loadFishVoices({ force: true });
});

fishVoiceList.addEventListener('click', (event) => {
  const row = event.target.closest('.voice-row[data-id]');
  if (!row) return;
  fishRefInput.value = row.dataset.id;
  prefs = savePrefs({ fishRef: row.dataset.id });
  updateFishChipActive();
  syncVoiceRowActive();
});

fishPresets.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip[data-id]');
  if (!chip) return;
  fishRefInput.value = chip.dataset.id;
  prefs = savePrefs({ fishRef: chip.dataset.id });
  updateFishChipActive();
});

mimoVoices.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip[data-voice]');
  if (!chip) return;
  prefs = savePrefs({ mimoVoice: chip.dataset.voice });
  renderMimoVoices();
});

savePresetBtn.addEventListener('click', () => {
  const id = fishRefInput.value.trim();
  if (!id) {
    toast(t('errors.noRef'), 'error');
    fishRefInput.focus();
    return;
  }
  const answer = window.prompt(t('voice.presetNamePrompt'), '');
  if (answer === null) return;
  const name = answer.trim() || id.slice(0, 10);
  try {
    const result = addFishVoice({ name, id });
    if (result.duplicate) {
      toast(t('settings.voices.duplicate'), 'info');
    } else if (result.added) {
      toast(t('voice.presetSaved'), 'success');
    }
    renderFishPresets();
  } catch {
    toast(t('settings.saveFailed'), 'error');
  }
});

speedRange.addEventListener('input', () => {
  prefs = savePrefs({ speed: Number(speedRange.value) });
  updateRangeOutputs();
});

volumeRange.addEventListener('input', () => {
  prefs = savePrefs({ volume: Number(volumeRange.value) });
  updateRangeOutputs();
});

formatSelect.addEventListener('change', () => {
  const value = formatSelect.value === 'wav' ? 'wav' : 'mp3';
  prefs = savePrefs(prefs.engine === 'fish' ? { formatFish: value } : { formatMimo: value });
});

synthBtn.addEventListener('click', handleSynthesize);

cancelBtn.addEventListener('click', () => {
  if (activeController) activeController.abort();
});

downloadBtn.addEventListener('click', () => {
  if (!currentDownload) {
    toast(t('errors.emptyAudio'), 'error');
    return;
  }
  triggerDownload(currentDownload.url, currentDownload.filename);
});

audioPlayer.addEventListener('play', () => setPlaying(true));
audioPlayer.addEventListener('pause', () => setPlaying(false));
audioPlayer.addEventListener('ended', () => setPlaying(false));
audioPlayer.addEventListener('emptied', () => setPlaying(false));

clearHistoryBtn.addEventListener('click', () => {
  if (!getHistory().length) return;
  if (!window.confirm(t('history.confirmClear'))) return;
  try {
    clearHistory();
    renderHistory();
    toast(t('history.cleared'), 'success');
  } catch {
    toast(t('history.saveFailed'), 'error');
  }
});

historyList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const entry = getHistory().find((item) => item.id === button.dataset.id);
  if (!entry) return;

  switch (button.dataset.action) {
    case 'play':
      if (!entry.audio) {
        toast(t('history.audioMissingToast'), 'error');
        return;
      }
      showHistoryEntry(entry);
      break;
    case 'download':
      if (!entry.audio) {
        toast(t('history.audioMissingToast'), 'error');
        return;
      }
      triggerDownload(entry.audio, filenameFor(entry, entry.ts));
      break;
    case 'reuse':
      applyEntryToForm(entry);
      break;
    case 'delete':
      try {
        removeHistoryEntry(entry.id);
        renderHistory();
        toast(t('history.deleted'), 'success');
      } catch {
        toast(t('history.saveFailed'), 'error');
      }
      break;
    default:
      break;
  }
});

window.addEventListener('storage', (event) => {
  if (event.key && event.key.startsWith('tts_free_')) refreshFromStorage();
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) refreshFromStorage();
});

/* ---------- init ---------- */

applyI18n(document);
textInput.maxLength = MAX_CHARS;
syncFormFromPrefs();
selectEngine(prefs.engine, { persist: false });
updateCharCount();
updateHistorySubtitle();
renderHistory();
renderSynthButton();

checkProxy().then((online) => {
  proxyNotice.hidden = online;
});
