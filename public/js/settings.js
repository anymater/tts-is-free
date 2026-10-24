import { FISH_MODEL, MIMO_DEFAULT_MODEL } from './config.js';
import { applyI18n, t, toggleLang } from './i18n.js';
import {
  addFishVoice,
  clearAllLocalData,
  clearHistory,
  clearKeys,
  getFishVoices,
  getHistory,
  getSettings,
  removeFishVoice,
  saveSettings
} from './store.js';

const $ = (id) => document.getElementById(id);

const langToggle = $('langToggle');
const settingsForm = $('settingsForm');
const fishKeyInput = $('fishKeyInput');
const fishKeyReveal = $('fishKeyReveal');
const mimoKeyInput = $('mimoKeyInput');
const mimoKeyReveal = $('mimoKeyReveal');
const fishModelValue = $('fishModelValue');
const mimoModelInput = $('mimoModelInput');
const resetMimoModelBtn = $('resetMimoModelBtn');
const voiceForm = $('voiceForm');
const voiceNameInput = $('voiceNameInput');
const voiceIdInput = $('voiceIdInput');
const addVoiceBtn = $('addVoiceBtn');
const voiceList = $('voiceList');
const voiceEmpty = $('voiceEmpty');
const historyCount = $('historyCount');
const clearHistoryBtn = $('clearHistoryBtn');
const clearKeysBtn = $('clearKeysBtn');
const clearAllBtn = $('clearAllBtn');
const toastHost = $('toastHost');

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

function renderRevealButtons() {
  const pairs = [
    [fishKeyReveal, fishKeyInput],
    [mimoKeyReveal, mimoKeyInput]
  ];
  for (const [button, input] of pairs) {
    const visible = input.type === 'text';
    button.textContent = t(visible ? 'settings.hide' : 'settings.show');
    button.setAttribute('aria-label', t(visible ? 'settings.hide' : 'settings.show'));
    button.setAttribute('aria-pressed', String(visible));
  }
}

function setupReveal(button, input) {
  button.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    renderRevealButtons();
    input.focus();
  });
}

function loadSettings() {
  const settings = getSettings();
  fishKeyInput.value = settings.fishKey;
  mimoKeyInput.value = settings.mimoKey;
  mimoModelInput.value = settings.mimoModel;
  fishModelValue.value = FISH_MODEL;
}

function renderVoiceList() {
  const voices = getFishVoices();
  voiceList.replaceChildren();
  voiceEmpty.hidden = voices.length > 0;

  for (const voice of voices) {
    const row = document.createElement('li');
    row.className = 'voice-row';

    const main = document.createElement('div');
    main.className = 'voice-row-main';

    const name = document.createElement('span');
    name.className = 'voice-row-name';
    name.textContent = voice.official
      ? t('voice.officialName')
      : voice.name || voice.id.slice(0, 12);

    const id = document.createElement('span');
    id.className = 'voice-row-id';
    id.textContent = voice.id;

    main.append(name, id);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button ghost small';
    remove.dataset.remove = voice.id;
    remove.textContent = t('settings.voices.remove');

    row.append(main, remove);
    voiceList.append(row);
  }
}

function refreshHistoryCount() {
  const count = getHistory().length;
  historyCount.textContent = t('settings.data.historyCount', { count });
  clearHistoryBtn.disabled = count === 0;
}

function addVoice() {
  const name = voiceNameInput.value.trim();
  const id = voiceIdInput.value.trim();

  if (!name || !id) {
    toast(t('settings.voices.invalid'), 'error');
    return;
  }

  try {
    const result = addFishVoice({ name, id });
    if (result.duplicate) {
      toast(t('settings.voices.duplicate'), 'info');
      return;
    }
    voiceNameInput.value = '';
    voiceIdInput.value = '';
    renderVoiceList();
    toast(t('settings.voices.added'), 'success');
  } catch {
    toast(t('settings.saveFailed'), 'error');
  }
}

function refreshLanguage() {
  applyI18n(document);
  renderRevealButtons();
  renderVoiceList();
  refreshHistoryCount();
}

/* ---------- events ---------- */

langToggle.addEventListener('click', () => {
  toggleLang();
  refreshLanguage();
});

setupReveal(fishKeyReveal, fishKeyInput);
setupReveal(mimoKeyReveal, mimoKeyInput);

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const fishKey = fishKeyInput.value.trim();
  const mimoKey = mimoKeyInput.value.trim();
  const mimoModel = mimoModelInput.value.trim() || MIMO_DEFAULT_MODEL;

  try {
    saveSettings({ fishKey, mimoKey, mimoModel });
    fishKeyInput.value = fishKey;
    mimoKeyInput.value = mimoKey;
    mimoModelInput.value = mimoModel;
    toast(t('settings.saved'), 'success');
  } catch {
    toast(t('settings.saveFailed'), 'error');
  }
});

resetMimoModelBtn.addEventListener('click', () => {
  mimoModelInput.value = MIMO_DEFAULT_MODEL;
  mimoModelInput.focus();
});

addVoiceBtn.addEventListener('click', addVoice);

voiceForm.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addVoice();
  }
});

voiceList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-remove]');
  if (!button) return;
  try {
    removeFishVoice(button.dataset.remove);
    renderVoiceList();
    toast(t('settings.voices.removed'), 'success');
  } catch {
    toast(t('settings.saveFailed'), 'error');
  }
});

clearHistoryBtn.addEventListener('click', () => {
  if (!window.confirm(t('settings.data.confirmClearHistory'))) return;
  try {
    clearHistory();
    refreshHistoryCount();
    toast(t('settings.data.historyCleared'), 'success');
  } catch {
    toast(t('settings.saveFailed'), 'error');
  }
});

clearKeysBtn.addEventListener('click', () => {
  if (!window.confirm(t('settings.data.confirmClearKeys'))) return;
  try {
    clearKeys();
    fishKeyInput.value = '';
    mimoKeyInput.value = '';
    toast(t('settings.data.keysCleared'), 'success');
  } catch {
    toast(t('settings.saveFailed'), 'error');
  }
});

clearAllBtn.addEventListener('click', () => {
  if (!window.confirm(t('settings.data.confirmClearAll'))) return;
  clearAllLocalData();
  fishKeyInput.value = '';
  mimoKeyInput.value = '';
  mimoModelInput.value = MIMO_DEFAULT_MODEL;
  fishModelValue.value = FISH_MODEL;
  renderVoiceList();
  refreshHistoryCount();
  toast(t('settings.data.allCleared'), 'success');
});

window.addEventListener('storage', (event) => {
  if (event.key && event.key.startsWith('tts_free_')) {
    renderVoiceList();
    refreshHistoryCount();
  }
});

/* ---------- init ---------- */

applyI18n(document);
loadSettings();
renderVoiceList();
refreshHistoryCount();
renderRevealButtons();
