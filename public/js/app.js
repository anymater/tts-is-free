import { HISTORY_LIMIT, MAX_CHARS, MIMO_VOICES } from './config.js';
import { applyI18n, formatDate, getLang, t, toggleLang } from './i18n.js';
import {
  addFishVoice,
  clearHistory,
  clearPendingHistoryEntry,
  createId,
  getDraftText,
  getFavorites,
  getFishVoices,
  getHistory,
  getPickerState,
  getPrefs,
  getRecentFishVoices,
  getSettings,
  hasKey,
  isFavorite,
  removeHistoryEntry,
  saveDraftText,
  saveHistoryEntry,
  savePickerState,
  savePrefs,
  saveVoiceTitle,
  toggleFavorite
} from './store.js';
import {
  SynthesisError,
  blobToDataUrl,
  buildMimoInstruction,
  checkProxy,
  fetchFishVoices,
  getOfficialQuota,
  onOfficialQuotaUpdate,
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
const fishVoiceFilters = $('fishVoiceFilters');
const fishVoiceGender = $('fishVoiceGender');
const fishVoiceSort = $('fishVoiceSort');
const fishVoiceMore = $('fishVoiceMore');
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
const modeRow = $('modeRow');
const modePill = $('modePill');
const modeQuota = $('modeQuota');
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
    keyNoticeText.textContent = t('notice.officialMode');
  }
  updateModeIndicator();
}

// 模式指示：当前引擎填了 Key → “自定义 Key”；没填 → “官方免费额度”，
// 并在拿到服务端额度头后展示本月剩余额度。
function updateModeIndicator() {
  const custom = hasKey(prefs.engine);
  modePill.textContent = t(custom ? 'mode.custom' : 'mode.official');
  modePill.classList.toggle('custom', custom);
  modePill.classList.toggle('official', !custom);
  const quota = custom ? null : getOfficialQuota();
  if (quota) {
    modeQuota.textContent = t('mode.quota', { remaining: quota.remaining, limit: quota.limit });
  } else {
    modeQuota.textContent = custom ? '' : t('mode.quotaUnknown');
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

/* ---------- Fish voice picker (browse the Fish Audio library) ----------
   Tabs mirror the official Fish picker (recent / explore / default /
   mine / favorites) and go one further: audition with your own text,
   local favorites that need no Fish login, and recent voices derived
   from this app's synthesis history. */

let pickerTab = 'explore';
let pickerQuery = '';
let pickerGender = 'all';
let pickerSort = 'score';
let pickerSeq = 0;
let pickerSearchTimer = null;
const pickerCache = new Map();
let auditionAudio = null;
let auditionBtn = null;

const API_TABS = new Set(['explore', 'default', 'mine']);

function pickerCacheKey() {
  return [pickerTab, pickerQuery, pickerGender, pickerSort].join('|');
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

function formatCount(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function langLabel(code) {
  const map = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', it: 'Italiano', nl: 'Nederlands' };
  return map[code] || code;
}

function voiceGender(tags) {
  const lower = (Array.isArray(tags) ? tags : []).map((tag) => String(tag).toLowerCase());
  const has = (...words) => lower.some((tag) => words.some((word) => tag.includes(word)));
  if (has('female', '女性', '女')) return 'female';
  if (has('male', '男性', '男')) return 'male';
  return '';
}

function syncVoiceCardActive() {
  const current = fishRefInput.value.trim();
  fishVoiceList.querySelectorAll('.voice-card[data-id]').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.id === current);
  });
}

function selectVoice(voice) {
  fishRefInput.value = voice.id;
  prefs = savePrefs({ fishRef: voice.id });
  if (voice.title) saveVoiceTitle(voice.id, voice.title);
  updateFishChipActive();
  syncVoiceCardActive();
}

function stopAudition() {
  if (auditionAudio) {
    auditionAudio.pause();
    auditionAudio = null;
  }
  if (auditionBtn) {
    auditionBtn.textContent = t('voice.picker.audition');
    auditionBtn.disabled = false;
    auditionBtn = null;
  }
}

async function auditionVoice(voice, btn) {
  if (auditionBtn === btn) {
    stopAudition();
    return;
  }
  stopAudition();
  // Official sample first: free, instant, and exactly how the voice
  // sounds. Only fall back to synthesizing the user's text when the
  // voice has no sample audio.
  if (voice.sample_audio) {
    const audio = new Audio(voice.sample_audio);
    auditionAudio = audio;
    auditionBtn = btn;
    btn.textContent = t('voice.picker.auditionStop');
    audio.addEventListener('ended', stopAudition);
    audio.addEventListener('error', () => {
      stopAudition();
      toast(t('voice.picker.auditionFailed'), 'error');
    });
    try {
      await audio.play();
    } catch {
      stopAudition();
      toast(t('voice.picker.auditionFailed'), 'error');
    }
    return;
  }
  const settings = getSettings();
  const text = textInput.value.trim() || t('voice.picker.auditionText');
  btn.textContent = t('voice.picker.auditioning');
  btn.disabled = true;
  auditionBtn = btn;
  try {
    const { blob } = await synthesizeFish({
      text,
      referenceId: voice.id,
      format: prefs.formatFish,
      speed: prefs.speed,
      volumeDb: volumePercentToDb(prefs.volume),
      // 没填 Key 时留空 → 代理走官方模式（计入官方额度）。
      key: settings.fishKey
    });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    auditionAudio = audio;
    btn.disabled = false;
    btn.textContent = t('voice.picker.auditionStop');
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url);
      stopAudition();
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      stopAudition();
      toast(t('voice.picker.auditionFailed'), 'error');
    });
    await audio.play();
  } catch (err) {
    stopAudition();
    if (err && err.name !== 'AbortError') toast(t('voice.picker.auditionFailed'), 'error');
  }
}

function voiceCard(voice) {
  const card = document.createElement('article');
  card.className = 'voice-card';
  card.dataset.id = voice.id;
  if (voice.id === fishRefInput.value.trim()) card.classList.add('is-active');

  const avatar = document.createElement('div');
  avatar.className = 'voice-avatar';
  const initial = (voice.title || voice.id).trim().slice(0, 1).toUpperCase() || '?';
  const imgSrc = voice.cover_image || (voice.author && voice.author.avatar) || '';
  if (imgSrc) {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.remove();
      avatar.textContent = initial;
    });
    avatar.append(img);
  } else {
    avatar.textContent = initial;
  }

  const body = document.createElement('div');
  body.className = 'voice-body';

  const nameRow = document.createElement('div');
  nameRow.className = 'voice-name-row';
  const name = document.createElement('strong');
  name.className = 'voice-name';
  name.textContent = voice.title || voice.id.slice(0, 12);
  nameRow.append(name);
  if (voice.author && voice.author.nickname) {
    const author = document.createElement('span');
    author.className = 'voice-author';
    author.textContent = ` · ${voice.author.nickname}`;
    nameRow.append(author);
  }

  const tagsRow = document.createElement('div');
  tagsRow.className = 'voice-tags';
  const gender = voiceGender(voice.tags);
  const chips = [];
  if (Array.isArray(voice.languages)) {
    for (const lang of voice.languages.slice(0, 2)) chips.push(langLabel(lang));
  }
  if (gender === 'female') chips.push(t('voice.picker.genderFemale'));
  if (gender === 'male') chips.push(t('voice.picker.genderMale'));
  if (Array.isArray(voice.tags)) {
    for (const tag of voice.tags.slice(0, 3)) {
      if (!chips.includes(tag)) chips.push(tag);
    }
  }
  for (const chip of chips.slice(0, 5)) {
    const el = document.createElement('span');
    el.className = 'voice-tag';
    el.textContent = chip;
    tagsRow.append(el);
  }

  const stats = document.createElement('div');
  stats.className = 'voice-stats';
  const statParts = [];
  if (typeof voice.task_count === 'number') {
    statParts.push(t('voice.picker.uses', { n: formatCount(voice.task_count) }));
  }
  if (typeof voice.like_count === 'number') {
    statParts.push(t('voice.picker.likes', { n: formatCount(voice.like_count) }));
  }
  if (typeof voice.mark_count === 'number') {
    statParts.push(t('voice.picker.marks', { n: formatCount(voice.mark_count) }));
  }
  stats.textContent = statParts.join(' · ') || voice.id;

  body.append(nameRow);
  if (voice.description) {
    const desc = document.createElement('p');
    desc.className = 'voice-desc';
    desc.textContent = voice.description;
    body.append(desc);
  }
  if (tagsRow.childElementCount) body.append(tagsRow);
  body.append(stats);

  const actions = document.createElement('div');
  actions.className = 'voice-actions';
  const audition = document.createElement('button');
  audition.type = 'button';
  audition.className = 'button ghost small';
  audition.textContent = t('voice.picker.audition');
  audition.addEventListener('click', (event) => {
    event.stopPropagation();
    auditionVoice(voice, audition);
  });
  const use = document.createElement('button');
  use.type = 'button';
  use.className = 'button primary small';
  use.textContent = t('voice.picker.use');
  use.addEventListener('click', (event) => {
    event.stopPropagation();
    selectVoice(voice);
  });
  const fav = document.createElement('button');
  fav.type = 'button';
  fav.className = 'button ghost small voice-fav';
  const favored = isFavorite(voice.id);
  fav.textContent = favored ? t('voice.picker.favorited') : t('voice.picker.favorite');
  if (favored) fav.classList.add('is-active');
  fav.addEventListener('click', (event) => {
    event.stopPropagation();
    const result = toggleFavorite(voice);
    fav.textContent = result.added ? t('voice.picker.favorited') : t('voice.picker.favorite');
    fav.classList.toggle('is-active', result.added);
    if (pickerTab === 'favorites' && !result.added) loadFishVoices();
  });
  actions.append(audition, use, fav);

  card.append(avatar, body, actions);
  card.addEventListener('click', () => selectVoice(voice));
  return card;
}

function renderVoiceList(items, { append = false } = {}) {
  if (!append) fishVoiceList.replaceChildren();
  for (const item of items) fishVoiceList.append(voiceCard(item));
  syncVoiceCardActive();
}

function updateMoreButton(entry) {
  const hasMore = Boolean(entry && typeof entry.total === 'number' && entry.items.length < entry.total);
  fishVoiceMore.hidden = !hasMore;
  fishVoiceMore.disabled = false;
}

async function loadFishVoices({ force = false, more = false } = {}) {
  // Local tabs need no key and no network.
  if (pickerTab === 'recent') {
    const items = getRecentFishVoices();
    renderVoiceList(items);
    fishVoiceMore.hidden = true;
    setPickerStatus(items.length ? '' : t('voice.picker.emptyRecent'));
    return;
  }
  if (pickerTab === 'favorites') {
    const items = getFavorites();
    renderVoiceList(items);
    fishVoiceMore.hidden = true;
    setPickerStatus(items.length ? '' : t('voice.picker.emptyFavorites'));
    return;
  }

  const settings = getSettings();
  // 公开列表无需 Key（代理回退官方 Key）；只有「我的音色」必须用用户自己的
  // Key，因为要查的是用户账号下的私有模型。
  if (pickerTab === 'mine' && !settings.fishKey) {
    fishVoiceList.replaceChildren();
    fishVoiceMore.hidden = true;
    setPickerStatus(t('voice.picker.needKey'));
    return;
  }

  const key = pickerCacheKey();
  const cached = pickerCache.get(key);
  if (!more && !force && cached) {
    renderVoiceList(cached.items);
    updateMoreButton(cached);
    setPickerStatus(cached.items.length ? '' : t('voice.picker.empty'));
    return;
  }

  const page = more && cached ? cached.page + 1 : 1;
  const seq = ++pickerSeq;
  if (!more) {
    fishVoiceList.replaceChildren();
    fishVoiceMore.hidden = true;
    setPickerStatus(t('voice.picker.loading'));
  } else {
    fishVoiceMore.disabled = true;
  }

  try {
    const params = {
      key: settings.fishKey,
      scope: pickerTab === 'mine' ? 'mine' : 'public',
      query: pickerQuery,
      tag: pickerGender === 'all' ? '' : pickerGender,
      sortBy: pickerSort,
      pageSize: 30,
      pageNumber: page
    };
    if (pickerTab === 'default') params.licensed = true;
    if (pickerTab !== 'mine') params.language = 'zh';
    let data = await fetchFishVoices(params);
    // The zh filter can come back empty for narrow queries; fall back to
    // the unfiltered list instead of an empty picker.
    if (pickerTab !== 'mine' && page === 1 && !data.items.length) {
      data = await fetchFishVoices({ ...params, language: '' });
    }
    if (seq !== pickerSeq) return;
    const items = more && cached ? [...cached.items, ...data.items] : data.items;
    const entry = { items, page, total: data.total };
    pickerCache.set(key, entry);
    renderVoiceList(data.items, { append: more });
    updateMoreButton(entry);
    // Fish caps its reported total (1000), so a short last page is the
    // reliable end-of-list signal even when total says otherwise.
    if (data.items.length < 30) fishVoiceMore.hidden = true;
    setPickerStatus(items.length ? '' : t('voice.picker.empty'));
  } catch {
    if (seq !== pickerSeq) return;
    if (!more) setPickerStatus(t('voice.picker.error'));
    fishVoiceMore.disabled = false;
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
      missing.textContent = t(entry.pending ? 'history.audioPending' : 'history.audioMissing');
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
    case 'official_quota_exceeded':
      return { text: t('errors.officialQuotaExceeded'), detail };
    case 'official_key_missing':
      return { text: t('errors.officialKeyMissing'), detail };
    case 'official_quota_unavailable':
      return { text: t('errors.officialQuotaUnavailable'), detail };
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
    id: meta.historyId || createId(),
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
  saveDraftText(entry.text || '');
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
  // 空 Key 不再拦截：不带 Authorization 时代理自动走官方免费额度。
  const key = engine === 'fish' ? settings.fishKey : settings.mimoKey;

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

  // Record the text in history BEFORE the network call, so the text is
  // kept even if synthesis fails or is cancelled. The pending entry is
  // replaced in place by persistHistory on success (same id), or flipped
  // to a plain text-only record in finally otherwise. History must never
  // block synthesis, so failures here are swallowed.
  const historyId = createId();
  try {
    saveHistoryEntry({
      id: historyId,
      ts: Date.now(),
      engine,
      voice,
      text,
      speed,
      volume: volumePercent,
      format,
      mime: '',
      size: 0,
      audio: null,
      audioDropped: false,
      pending: true
    });
    renderHistory();
  } catch {
    // Ignore: the draft autosave still preserves the text.
  }

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
      format: audio.format,
      historyId
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
    // Success already replaced the pending entry (same id); this only
    // flips it to a text-only record on abort/failure.
    if (clearPendingHistoryEntry(historyId)) renderHistory();
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

textInput.addEventListener('input', () => {
  updateCharCount();
  saveDraftText(textInput.value);
});

fishRefInput.addEventListener('input', () => {
  prefs = savePrefs({ fishRef: fishRefInput.value });
  updateFishChipActive();
  syncVoiceCardActive();
});

document.querySelectorAll('#fishVoicePicker .picker-tab[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    if (pickerTab === tab.dataset.tab) return;
    pickerTab = tab.dataset.tab;
    savePickerState({ tab: pickerTab });
    document.querySelectorAll('#fishVoicePicker .picker-tab[data-tab]').forEach((other) => {
      other.classList.toggle('is-active', other === tab);
    });
    fishVoiceFilters.hidden = !API_TABS.has(pickerTab);
    loadFishVoices();
  });
});

fishVoiceSearch.addEventListener('input', () => {
  window.clearTimeout(pickerSearchTimer);
  pickerSearchTimer = window.setTimeout(() => {
    pickerQuery = fishVoiceSearch.value.trim();
    savePickerState({ query: pickerQuery });
    if (API_TABS.has(pickerTab)) loadFishVoices();
  }, 400);
});

fishVoiceGender.addEventListener('change', () => {
  pickerGender = fishVoiceGender.value === 'male' ? 'male' : fishVoiceGender.value === 'female' ? 'female' : 'all';
  savePickerState({ gender: pickerGender });
  if (API_TABS.has(pickerTab)) loadFishVoices();
});

fishVoiceSort.addEventListener('change', () => {
  pickerSort = ['task_count', 'created_at'].includes(fishVoiceSort.value) ? fishVoiceSort.value : 'score';
  savePickerState({ sort: pickerSort });
  if (API_TABS.has(pickerTab)) loadFishVoices();
});

fishVoicesRefresh.addEventListener('click', () => {
  loadFishVoices({ force: true });
});

fishVoiceMore.addEventListener('click', () => {
  loadFishVoices({ more: true });
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
// Restore the in-progress draft (saved on every keystroke) so a refresh
// never eats typed text. Only fills when the field starts empty.
if (!textInput.value) {
  const draft = getDraftText();
  if (draft) textInput.value = draft;
}
syncFormFromPrefs();
// Restore the picker browse state before the first load, so the picker
// opens exactly where the user left it (tab, filters, search).
{
  const pickerState = getPickerState();
  pickerTab = pickerState.tab;
  pickerGender = pickerState.gender;
  pickerSort = pickerState.sort;
  pickerQuery = pickerState.query;
  document.querySelectorAll('#fishVoicePicker .picker-tab[data-tab]').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === pickerTab);
  });
  fishVoiceFilters.hidden = !API_TABS.has(pickerTab);
  fishVoiceSearch.value = pickerQuery;
  fishVoiceGender.value = pickerGender;
  fishVoiceSort.value = pickerSort;
}
selectEngine(prefs.engine, { persist: false });
updateCharCount();
updateHistorySubtitle();
renderHistory();
renderSynthButton();

checkProxy().then((online) => {
  proxyNotice.hidden = online;
});

// 任何一次 API 响应带回额度头（含试听、音色列表失败的 429）都会刷新指示器。
onOfficialQuotaUpdate(() => updateModeIndicator());
