# TTS is free — 免费文本转语音 Web 应用

## 项目简介
一个免费的文本转语音（TTS）Web 应用，接入两个免费 TTS 引擎：
1. **Fish Audio**（主引擎，文档稳定）— S2.1 Pro 免费档
2. **MiMo TTS**（小米，备用引擎）— V2.5 系列限时免费

## 功能需求
- 文本输入框（支持中文/英文），字符计数显示
- 引擎选择：Fish Audio / MiMo TTS
- Fish Audio：音色选择（让用户粘贴 `reference_id`，或提供几个常用音色 ID 输入框）
- MiMo：音色选择（预设：冰糖 / 茉莉 / 苏打 / 白桦 / Mia / Chloe / Milo / Dean）
- 语速/音量调节（Fish Audio 支持 prosody；MiMo 通过 user 消息做风格指令）
- 点击合成 → 播放音频 + 提供下载按钮（mp3/wav）
- 合成历史记录（localStorage）
- API Key 配置页（存在 localStorage，不硬编码，不提交到 git）

## 技术要求
- 纯前端或轻量后端（二选一，推荐纯前端 + 直接调 API，最简单可部署）
- 如果纯前端：注意 CORS — Fish Audio 和 MiMo 是否支持浏览器直调需验证；若不支持，加一个极简的 Node/Express 代理后端
- 响应式设计，简洁现代 UI，中英文双语界面
- README 写清楚：如何获取两个 API Key、免费额度说明

## API 细节

### Fish Audio（主）
- Endpoint: `POST https://api.fish.audio/v1/tts`
- Headers: `Authorization: Bearer $FISH_API_KEY`, `Content-Type: application/json`, **`model: s2.1-pro-free`**（免费档关键）
- Body: `{"text": "...", "reference_id": "VOICE_ID", "format": "mp3"}`
- Response: 直接返回音频二进制
- 免费：Fair Use 不限量（促销到 2026-11-30，之后可能变收费；把 `model` header 做成常量方便切换）
- Key 获取：https://fish.audio/app/api-keys/（免费注册，无需信用卡）
- 音色 ID：用户从 Fish Audio 音色库挑选，或自己克隆（免费档含克隆）

### MiMo TTS（备用）
- Endpoint: `POST https://api.xiaomimimo.com/v1/chat/completions`（OpenAI 兼容）
- Headers: `Authorization: Bearer $MIMO_API_KEY`
- Body:
  ```json
  {
    "model": "mimo-v2.5-tts",
    "messages": [{"role": "assistant", "content": "要合成的文本"}],
    "audio": {"format": "wav", "voice": "冰糖"}
  }
  ```
- Response: `choices[0].message.audio.data` 是 base64 音频，需解码
- ⚠️ 注意：MiMo V2.5 系列在 2026-10-21 已宣布退役部分模型，TTS 的 V2.5 模型 ID 可用性不确定。实现时把 model ID 做成可配置，优先从 https://platform.xiaomimimo.com 的模型列表确认当前可用 ID（可能是 V2.6 系列）。
- Key 获取：https://platform.xiaomimimo.com（需注册，可能要中国手机号，未验证）

## 注意事项
- API Key 绝不硬编码，用环境变量或 localStorage 用户配置
- Fish Audio 的 `reference_id` 在实际使用中是必填的，UI 必须让用户能填
- 两个引擎都要有错误处理（Key 无效、额度超限、网络错误），给用户清晰提示
