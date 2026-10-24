export const FISH_MODEL = 's2.1-pro-free';
export const MIMO_DEFAULT_MODEL = 'mimo-v2.5-tts';

export const MIMO_VOICES = ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'];

export const MAX_CHARS = 5000;
export const HISTORY_LIMIT = 20;

// Documented Fish Audio example voice ID. Public IDs can change, so users
// should copy fresh IDs from fish.audio. Users can add their own presets.
export const DEFAULT_FISH_VOICES = [
  { id: '7f92f8afb8ec43bf81429cc1c9199cb1', name: '', official: true }
];

export const API = {
  fish: '/api/fish',
  mimo: '/api/mimo',
  health: '/api/health'
};

export const LINKS = {
  fishKeys: 'https://fish.audio/app/api-keys/',
  fishSite: 'https://fish.audio',
  mimoPlatform: 'https://platform.xiaomimimo.com'
};

export const DEFAULT_PREFS = {
  engine: 'fish',
  fishRef: '',
  mimoVoice: '冰糖',
  speed: 1,
  volume: 100,
  formatFish: 'mp3',
  formatMimo: 'wav'
};
