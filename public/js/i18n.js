const LANG_KEY = 'tts_free_lang';

const dicts = {
  zh: {
    'meta.title': 'TTS is free — 免费文本转语音',
    'meta.settingsTitle': '设置 — TTS is free',
    'a11y.skip': '跳到主要内容',
    'a11y.switchLanguage': '切换语言',

    'brand.tagline': '免费 TTS 工作室',
    'nav.settings': '设置',
    'nav.language': 'EN',

    'hero.eyebrow': '免费 · 无需安装 · 双引擎',
    'hero.title': '让文字，开口说话。',
    'hero.subtitle': '使用 Fish Audio 与 MiMo TTS 免费合成语音。API Key 只保存在你的浏览器中，不会硬编码或提交到代码仓库。',
    'hero.badgeFish': 'Fish Audio · 主引擎',
    'hero.badgeMimo': 'MiMo TTS · 备用',
    'hero.badgeLocal': '密钥仅存本地',
    'hero.freePill': 'FREE',

    'composer.title': '合成',
    'composer.subtitle': '输入文本，选择引擎与音色。',
    'text.label': '文本',
    'text.placeholder': '在这里输入中文或英文文本…',
    'text.count': '{count} / {max} 字符',

    'engine.label': '引擎',
    'engine.fish.name': 'Fish Audio',
    'engine.fish.desc': '主引擎 · 自然音色 · 免费档',
    'engine.mimo.name': 'MiMo TTS',
    'engine.mimo.desc': '小米 · 备用 · 限时免费',

    'voice.label': '音色',
    'voice.fish.refLabel': 'Reference ID（必填）',
    'voice.fish.refPlaceholder': '粘贴 Fish Audio 音色 ID',
    'voice.fish.refHelp': '点选上方音色会自动填入，也可手动粘贴 ID。',
    'voice.picker.title': '选择音色',
    'voice.picker.popular': '热门音色',
    'voice.picker.recent': '最近使用',
    'voice.picker.explore': '探索',
    'voice.picker.default': '默认声音',
    'voice.picker.mine': '我的音色',
    'voice.picker.favorites': '已收藏',
    'voice.picker.refresh': '刷新',
    'voice.picker.searchPlaceholder': '搜索音色名称…',
    'voice.picker.genderAll': '全部性别',
    'voice.picker.genderFemale': '女性',
    'voice.picker.genderMale': '男性',
    'voice.picker.sortScore': '综合推荐',
    'voice.picker.sortHot': '最热门',
    'voice.picker.sortNew': '最新',
    'voice.picker.loadMore': '加载更多',
    'voice.picker.audition': '试听',
    'voice.picker.auditioning': '试听中…',
    'voice.picker.auditionStop': '停止',
    'voice.picker.auditionText': '大家好，我是小爱，很高兴认识你。',
    'voice.picker.auditionFailed': '试听失败，请稍后再试。',
    'voice.picker.auditionHint': '有官方试听的直接播放原声；没有的才用当前文本（为空时用默认问候语）合成一次。',
    'voice.picker.use': '使用',
    'voice.picker.favorite': '收藏',
    'voice.picker.favorited': '已收藏',
    'voice.picker.needKey': '请先在设置页填写 Fish Audio Key，才能浏览音色库。',
    'voice.picker.loading': '正在加载音色…',
    'voice.picker.empty': '没有找到音色，换个关键词试试。',
    'voice.picker.emptyRecent': '还没有用过的音色，先去探索里选一个。',
    'voice.picker.emptyFavorites': '还没有收藏的音色，点卡片上的「收藏」就能存到这里。',
    'voice.picker.error': '音色列表加载失败，仍可手动粘贴 ID。',
    'voice.picker.uses': '{n} 次使用',
    'voice.picker.likes': '{n} 点赞',
    'voice.picker.marks': '{n} 收藏',
    'voice.fish.library': '打开 Fish Audio ↗',
    'voice.presets': '预设音色',
    'voice.officialName': '官方文档示例',
    'voice.officialHint': '文档示例 ID，可能失效；请以 Fish Audio 当前音色库为准',
    'voice.savePreset': '存为预设',
    'voice.presetNamePrompt': '给这个音色起个名字',
    'voice.presetSaved': '已保存预设音色',
    'voice.noPresets': '暂无预设，可在设置页添加。',
    'voice.mimo.hint': '选择一个预设音色。',

    'controls.speed': '语速',
    'controls.volume': '音量',
    'controls.format': '输出格式',
    'controls.formatHelp': 'Fish 默认 mp3；MiMo 默认 wav（如 mp3 失败请切到 wav）。',

    'synth.button': '合成语音',
    'synth.loading': '正在合成…',
    'synth.cancel': '取消',
    'synth.canceled': '已取消合成',

    'result.title': '播放',
    'result.emptyTitle': '准备开始',
    'result.emptyBody': '合成后的音频会出现在这里，并自动保存到历史记录。',
    'result.download': '下载音频',
    'result.engine': '引擎',
    'result.voice': '音色',
    'result.format': '格式',
    'result.size': '大小',

    'history.title': '历史记录',
    'history.subtitle': '最近 {max} 条 · 保存在 localStorage',
    'history.empty': '还没有历史记录。',
    'history.clear': '清空',
    'history.play': '播放',
    'history.download': '下载',
    'history.reuse': '载入',
    'history.delete': '删除',
    'history.audioMissing': '音频未保留',
    'history.audioMissingToast': '这条记录的音频已不在本地，无法播放或下载。',
    'history.cleared': '历史记录已清空',
    'history.deleted': '已删除',
    'history.confirmClear': '确定清空全部历史记录？',
    'history.saveDropped': '本地空间不足，旧记录的音频已被移除。',
    'history.saveFailed': '无法保存历史记录：本地存储空间不足。',
    'history.reused': '已载入这条记录的设置',

    'notice.noKey': '尚未配置 {engine} 的 API Key。',
    'notice.openSettings': '前往设置',
    'notice.proxyDown': '无法连接后端代理。请先运行 npm start 启动应用。',

    'errors.noText': '请输入要合成的文本。',
    'errors.tooLong': '文本过长，最多 {max} 个字符。',
    'errors.noRef': '请填写 Fish Audio 的 Reference ID。',
    'errors.noFishKey': '请先在设置页填写 Fish Audio API Key。',
    'errors.noMimoKey': '请先在设置页填写 MiMo API Key。',
    'errors.invalidKey': 'API Key 无效或没有权限（HTTP {status}）。请检查设置。',
    'errors.quota': '额度不足或请求频率受限（HTTP {status}）。请查看账户额度或稍后再试。',
    'errors.model': '模型 ID 不可用（HTTP {status}）。请在设置页更新 MiMo 模型 ID。',
    'errors.badRequest': '请求被拒绝（HTTP {status}）。',
    'errors.network': '网络错误，无法连接代理或上游 API。请检查网络与服务是否启动。',
    'errors.timeout': '合成超时，请稍后重试。',
    'errors.server': '服务器错误（HTTP {status}）。',
    'errors.emptyAudio': '接口未返回音频数据。',
    'errors.badAudio': '接口返回的音频数据无法解析。',
    'errors.unknown': '合成失败，请重试。',
    'errors.detail': '技术详情：',

    'settings.title': '设置',
    'settings.subtitle': '配置 API Key、MiMo 模型与本地数据。',
    'settings.securityTitle': '密钥安全',
    'settings.securityBody': 'API Key 仅保存在当前浏览器的 localStorage 中，并随合成请求发送到本项目的同源代理。密钥不会被写入代码、日志，也不会提交到 Git。',
    'settings.fish.title': 'Fish Audio（主引擎）',
    'settings.fish.keyLabel': 'API Key',
    'settings.fish.keyPlaceholder': '粘贴 Fish Audio API Key',
    'settings.fish.keyHelp': '免费注册获取，无需信用卡。',
    'settings.fish.getKey': '获取 Fish API Key ↗',
    'settings.fish.modelLabel': '模型 Header',
    'settings.fish.modelHelp': '固定为 s2.1-pro-free（免费档）。如需切换，请修改 server.js 中的 FISH_MODEL 常量。',
    'settings.mimo.title': 'MiMo TTS（备用引擎）',
    'settings.mimo.keyLabel': 'API Key',
    'settings.mimo.keyPlaceholder': '粘贴 MiMo API Key',
    'settings.mimo.keyHelp': '需要小米开放平台账号；部分地区可能需要中国手机号。',
    'settings.mimo.getKey': '打开小米开放平台 ↗',
    'settings.mimo.modelLabel': '模型 ID',
    'settings.mimo.modelHelp': '默认 mimo-v2.5-tts。V2.5 系列部分模型已于 2026-10-21 退役；如遇模型不存在，请从小米开放平台获取当前可用 ID（可能是 V2.6 系列）。',
    'settings.mimo.modelPlaceholder': 'mimo-v2.5-tts',
    'settings.mimo.useDefault': '恢复默认',
    'settings.show': '显示',
    'settings.hide': '隐藏',

    'settings.voices.title': 'Fish 预设音色',
    'settings.voices.desc': '添加常用音色 ID，合成页会显示为一键选择的芯片。',
    'settings.voices.nameLabel': '名称',
    'settings.voices.namePlaceholder': '例如：我的克隆音色',
    'settings.voices.idLabel': 'Reference ID',
    'settings.voices.idPlaceholder': '粘贴 Fish Audio 音色 ID',
    'settings.voices.add': '添加',
    'settings.voices.remove': '删除',
    'settings.voices.empty': '暂无预设音色。',
    'settings.voices.added': '预设音色已添加',
    'settings.voices.removed': '预设音色已删除',
    'settings.voices.invalid': '请填写名称和 Reference ID。',
    'settings.voices.duplicate': '这个 Reference ID 已经在预设中。',

    'settings.data.title': '本地数据',
    'settings.data.desc': '历史记录、预设音色与偏好都保存在此浏览器。',
    'settings.data.historyCount': '{count} 条历史记录',
    'settings.data.clearHistory': '清空历史',
    'settings.data.clearKeys': '清除 API Key',
    'settings.data.clearAll': '清除全部本地数据',
    'settings.data.confirmClearHistory': '确定清空全部历史记录？',
    'settings.data.confirmClearKeys': '确定清除已保存的 API Key？',
    'settings.data.confirmClearAll': '确定清除全部本地数据（密钥、历史、预设、偏好）？',
    'settings.data.historyCleared': '历史记录已清空',
    'settings.data.keysCleared': 'API Key 已清除',
    'settings.data.allCleared': '本地数据已清除',
    'settings.save': '保存设置',
    'settings.saved': '设置已保存',
    'settings.saveFailed': '保存失败：浏览器存储不可用或已满。',
    'settings.back': '返回应用',
    'settings.footer': '密钥不会离开这台设备，除非用于向所选 TTS 服务发起请求。',

    'footer.note': '开源演示 · 请遵守各服务商的使用条款 · API Key 仅存本地',
    'footer.proxy': '通过同源 Node 代理调用，避免浏览器 CORS 限制。'
  },

  en: {
    'meta.title': 'TTS is free — Free text to speech',
    'meta.settingsTitle': 'Settings — TTS is free',
    'a11y.skip': 'Skip to main content',
    'a11y.switchLanguage': 'Switch language',

    'brand.tagline': 'Free TTS studio',
    'nav.settings': 'Settings',
    'nav.language': '中文',

    'hero.eyebrow': 'Free · No install · Two engines',
    'hero.title': 'Give your words a voice.',
    'hero.subtitle': 'Synthesize speech with Fish Audio and MiMo TTS for free. Your API keys stay in your browser — never hardcoded, never committed.',
    'hero.badgeFish': 'Fish Audio · Primary',
    'hero.badgeMimo': 'MiMo TTS · Fallback',
    'hero.badgeLocal': 'Keys stay local',
    'hero.freePill': 'FREE',

    'composer.title': 'Synthesize',
    'composer.subtitle': 'Enter text, then pick an engine and voice.',
    'text.label': 'Text',
    'text.placeholder': 'Type Chinese or English text here…',
    'text.count': '{count} / {max} characters',

    'engine.label': 'Engine',
    'engine.fish.name': 'Fish Audio',
    'engine.fish.desc': 'Primary · natural voices · free tier',
    'engine.mimo.name': 'MiMo TTS',
    'engine.mimo.desc': 'Xiaomi · fallback · limited-time free',

    'voice.label': 'Voice',
    'voice.fish.refLabel': 'Reference ID (required)',
    'voice.fish.refPlaceholder': 'Paste a Fish Audio voice ID',
    'voice.fish.refHelp': 'Pick a voice above and it fills in here, or paste an ID manually.',
    'voice.picker.title': 'Pick a voice',
    'voice.picker.popular': 'Popular voices',
    'voice.picker.recent': 'Recently used',
    'voice.picker.explore': 'Explore',
    'voice.picker.default': 'Default voices',
    'voice.picker.mine': 'My voices',
    'voice.picker.favorites': 'Saved',
    'voice.picker.refresh': 'Refresh',
    'voice.picker.searchPlaceholder': 'Search voices by name…',
    'voice.picker.genderAll': 'All genders',
    'voice.picker.genderFemale': 'Female',
    'voice.picker.genderMale': 'Male',
    'voice.picker.sortScore': 'Recommended',
    'voice.picker.sortHot': 'Most used',
    'voice.picker.sortNew': 'Newest',
    'voice.picker.loadMore': 'Load more',
    'voice.picker.audition': 'Preview',
    'voice.picker.auditioning': 'Playing…',
    'voice.picker.auditionStop': 'Stop',
    'voice.picker.auditionText': 'Hello, nice to meet you.',
    'voice.picker.auditionFailed': 'Preview failed. Please try again.',
    'voice.picker.auditionHint': 'Voices with an official sample play it directly; others synthesize once with your current text (or a default greeting if empty).',
    'voice.picker.use': 'Use',
    'voice.picker.favorite': 'Save',
    'voice.picker.favorited': 'Saved',
    'voice.picker.needKey': 'Add your Fish Audio key in Settings to browse voices.',
    'voice.picker.loading': 'Loading voices…',
    'voice.picker.empty': 'No voices found. Try another keyword.',
    'voice.picker.emptyRecent': 'No recently used voices yet — pick one from Explore.',
    'voice.picker.emptyFavorites': 'No saved voices yet — tap Save on a card to keep it here.',
    'voice.picker.error': "Couldn't load voices. You can still paste an ID manually.",
    'voice.picker.uses': '{n} uses',
    'voice.picker.likes': '{n} likes',
    'voice.picker.marks': '{n} saves',
    'voice.fish.library': 'Open Fish Audio ↗',
    'voice.presets': 'Preset voices',
    'voice.officialName': 'Official docs example',
    'voice.officialHint': 'Example ID from the docs; it may expire. Verify in Fish Audio.',
    'voice.savePreset': 'Save as preset',
    'voice.presetNamePrompt': 'Give this voice a name',
    'voice.presetSaved': 'Preset voice saved',
    'voice.noPresets': 'No presets yet. Add some in Settings.',
    'voice.mimo.hint': 'Choose a preset voice.',

    'controls.speed': 'Speed',
    'controls.volume': 'Volume',
    'controls.format': 'Output format',
    'controls.formatHelp': 'Fish defaults to mp3; MiMo defaults to wav (switch to wav if mp3 fails).',

    'synth.button': 'Synthesize',
    'synth.loading': 'Synthesizing…',
    'synth.cancel': 'Cancel',
    'synth.canceled': 'Synthesis canceled',

    'result.title': 'Playback',
    'result.emptyTitle': 'Ready when you are',
    'result.emptyBody': 'Your audio will appear here and be saved to history automatically.',
    'result.download': 'Download audio',
    'result.engine': 'Engine',
    'result.voice': 'Voice',
    'result.format': 'Format',
    'result.size': 'Size',

    'history.title': 'History',
    'history.subtitle': 'Latest {max} · stored in localStorage',
    'history.empty': 'No history yet.',
    'history.clear': 'Clear all',
    'history.play': 'Play',
    'history.download': 'Download',
    'history.reuse': 'Load',
    'history.delete': 'Delete',
    'history.audioMissing': 'Audio not stored',
    'history.audioMissingToast': 'Audio for this entry is no longer stored locally.',
    'history.cleared': 'History cleared',
    'history.deleted': 'Deleted',
    'history.confirmClear': 'Clear all history?',
    'history.saveDropped': 'Local storage was full, so audio from older entries was removed.',
    'history.saveFailed': 'Could not save history: local storage is full.',
    'history.reused': 'Settings loaded from this entry',

    'notice.noKey': 'No API key configured for {engine}.',
    'notice.openSettings': 'Open settings',
    'notice.proxyDown': 'Cannot reach the backend proxy. Start the app with npm start.',

    'errors.noText': 'Please enter some text.',
    'errors.tooLong': 'Text is too long (max {max} characters).',
    'errors.noRef': 'Please enter a Fish Audio Reference ID.',
    'errors.noFishKey': 'Add your Fish Audio API key in Settings first.',
    'errors.noMimoKey': 'Add your MiMo API key in Settings first.',
    'errors.invalidKey': 'Invalid or unauthorized API key (HTTP {status}). Check Settings.',
    'errors.quota': 'Quota or rate limit reached (HTTP {status}). Check your plan or retry later.',
    'errors.model': 'Model ID unavailable (HTTP {status}). Update the MiMo model ID in Settings.',
    'errors.badRequest': 'Request rejected (HTTP {status}).',
    'errors.network': 'Network error. Check your connection and that the server is running.',
    'errors.timeout': 'Synthesis timed out. Please retry.',
    'errors.server': 'Server error (HTTP {status}).',
    'errors.emptyAudio': 'The API returned no audio data.',
    'errors.badAudio': 'The API returned audio in an unexpected format.',
    'errors.unknown': 'Synthesis failed. Please retry.',
    'errors.detail': 'Technical detail:',

    'settings.title': 'Settings',
    'settings.subtitle': 'Configure API keys, the MiMo model, and local data.',
    'settings.securityTitle': 'Key security',
    'settings.securityBody': 'API keys are stored only in this browser’s localStorage and sent with synthesis requests to this app’s same-origin proxy. Keys are never written into code or logs, and never committed to Git.',
    'settings.fish.title': 'Fish Audio (primary)',
    'settings.fish.keyLabel': 'API key',
    'settings.fish.keyPlaceholder': 'Paste your Fish Audio API key',
    'settings.fish.keyHelp': 'Free to create; no credit card required.',
    'settings.fish.getKey': 'Get a Fish API key ↗',
    'settings.fish.modelLabel': 'Model header',
    'settings.fish.modelHelp': 'Fixed to s2.1-pro-free (free tier). To change it, edit the FISH_MODEL constant in server.js.',
    'settings.mimo.title': 'MiMo TTS (fallback)',
    'settings.mimo.keyLabel': 'API key',
    'settings.mimo.keyPlaceholder': 'Paste your MiMo API key',
    'settings.mimo.keyHelp': 'Requires a Xiaomi platform account; a Chinese phone number may be required in some regions.',
    'settings.mimo.getKey': 'Open the Xiaomi platform ↗',
    'settings.mimo.modelLabel': 'Model ID',
    'settings.mimo.modelHelp': 'Defaults to mimo-v2.5-tts. Some V2.5 models were retired on 2026-10-21; if the model is missing, copy the current ID (possibly a V2.6 model) from the Xiaomi platform.',
    'settings.mimo.modelPlaceholder': 'mimo-v2.5-tts',
    'settings.mimo.useDefault': 'Restore default',
    'settings.show': 'Show',
    'settings.hide': 'Hide',

    'settings.voices.title': 'Fish preset voices',
    'settings.voices.desc': 'Add frequently used voice IDs; they appear as one-click chips in the app.',
    'settings.voices.nameLabel': 'Name',
    'settings.voices.namePlaceholder': 'e.g. My cloned voice',
    'settings.voices.idLabel': 'Reference ID',
    'settings.voices.idPlaceholder': 'Paste a Fish Audio voice ID',
    'settings.voices.add': 'Add',
    'settings.voices.remove': 'Remove',
    'settings.voices.empty': 'No preset voices yet.',
    'settings.voices.added': 'Preset voice added',
    'settings.voices.removed': 'Preset voice removed',
    'settings.voices.invalid': 'Enter both a name and a Reference ID.',
    'settings.voices.duplicate': 'That Reference ID is already in your presets.',

    'settings.data.title': 'Local data',
    'settings.data.desc': 'History, preset voices, and preferences are stored in this browser.',
    'settings.data.historyCount': '{count} history entries',
    'settings.data.clearHistory': 'Clear history',
    'settings.data.clearKeys': 'Clear API keys',
    'settings.data.clearAll': 'Clear all local data',
    'settings.data.confirmClearHistory': 'Clear all history?',
    'settings.data.confirmClearKeys': 'Clear the saved API keys?',
    'settings.data.confirmClearAll': 'Clear all local data (keys, history, presets, preferences)?',
    'settings.data.historyCleared': 'History cleared',
    'settings.data.keysCleared': 'API keys cleared',
    'settings.data.allCleared': 'Local data cleared',
    'settings.save': 'Save settings',
    'settings.saved': 'Settings saved',
    'settings.saveFailed': 'Could not save: browser storage is unavailable or full.',
    'settings.back': 'Back to app',
    'settings.footer': 'Keys never leave this device except when sent to the selected TTS provider.',

    'footer.note': 'Open demo · Respect each provider’s terms · API keys stay local',
    'footer.proxy': 'Same-origin Node proxy avoids browser CORS restrictions.'
  }
};

function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // localStorage unavailable; fall back to navigator.
  }
  const nav = (navigator.language || '').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

let current = detectLang();

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return current;
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Ignore quota/privacy-mode failures.
  }
  applyDocumentLang();
  return current;
}

export function toggleLang() {
  return setLang(current === 'zh' ? 'en' : 'zh');
}

export function applyDocumentLang() {
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
}

export function t(key, vars) {
  const table = dicts[current] || dicts.zh;
  let value = table[key];
  if (value === undefined) value = dicts.en[key];
  if (value === undefined) return key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

export function applyI18n(root = document) {
  applyDocumentLang();
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
  });
}

export function formatDate(ts) {
  try {
    return new Intl.DateTimeFormat(current === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

applyDocumentLang();
