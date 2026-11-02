# TTS is free

免费文本转语音 Web 应用：主引擎 **Fish Audio**（S2.1 Pro 免费档），备用引擎 **MiMo TTS**（小米 V2.5 系列限时免费）。中英文双语界面、响应式设计，API Key 只保存在浏览器 `localStorage`。

> 本项目仅用于学习与个人测试。请遵守 Fish Audio 和小米开放平台的服务条款，不要用免费额度做违规或大规模商业用途。

---

## 功能

- 文本输入（中文 / 英文），实时字符计数（上限 5000）
- 引擎切换：Fish Audio / MiMo TTS
- Fish Audio：`reference_id` 必填，支持官方文档示例音色 + 自定义预设音色
- MiMo TTS：8 个预设音色（冰糖 / 茉莉 / 苏打 / 白桦 / Mia / Chloe / Milo / Dean）
- 语速 0.5×–2.0×、音量 10%–200%、输出格式 MP3 / WAV
- 点击合成后自动播放，支持下载音频
- 合成历史记录（localStorage，最近 20 条，可播放 / 下载 / 载入设置 / 删除）
- 设置页：API Key、MiMo 模型 ID、Fish 预设音色、本地数据清理
- 中英文界面一键切换；浅色 / 深色主题跟随系统
- 所有错误（无效 Key、额度、模型、网络等）都有明确提示

## 快速开始

要求 **Node.js ≥ 20**（使用内置 `fetch`，无第三方依赖）。

```bash
# 在项目目录
node --version        # 确认 >= 20
npm start             # 或：node server.js
```

打开 <http://localhost:3000>，进入 **设置** 页填入 API Key 即可使用。

不需要 `npm install`（项目零依赖）；执行 `npm install` 也不会安装任何包。

常用环境变量：

```bash
PORT=8080 HOST=127.0.0.1 npm start
```

### English quick start

1. Node.js 20+; run `npm start` in this directory (no `npm install` needed).
2. Open <http://localhost:3000/settings.html> and paste your Fish Audio / MiMo API keys.
3. Enter text, pick an engine and voice, then click **Synthesize**.

Keys are stored only in your browser's `localStorage`. The included same-origin Node proxy avoids browser CORS issues and keeps keys out of URLs.

---

## 架构与 CORS 决策

### 两个上游 API

| 引擎 | 上游请求 | 关键点 |
| --- | --- | --- |
| Fish Audio（主） | `POST https://api.fish.audio/v1/tts` | `Authorization: Bearer …`；**`model: s2.1-pro-free`**；`reference_id` 必填；返回音频二进制 |
| MiMo TTS（备用） | `POST https://api.xiaomimimo.com/v1/chat/completions` | OpenAI 兼容；`audio: { format, voice }`；返回 base64 音频 |

### CORS 结论

浏览器直连需要上游同时满足：

1. `Access-Control-Allow-Origin` 匹配页面 Origin；
2. `Access-Control-Allow-Headers` 包含 `authorization`、`content-type`（Fish 还需要 `model`）；
3. 实际 POST 响应也带同样的 CORS 头。

仓库内提供了预检探测脚本：

```bash
npm run test:cors
# 可指定 Origin：
TEST_ORIGIN=http://localhost:3000 npm run test:cors
```

脚本会对两个端点发送 `OPTIONS` 预检并打印 `access-control-allow-*` 头和结论。**本项目的构建沙箱禁止出站网络，因此无法在此环境完成真实预检**；请在你自己的机器上运行该脚本确认结果。

**最终决策：默认使用同源 Node 代理。** 原因：

- Fish Audio 的 TTS API 面向服务端调用，官方并不保证浏览器 CORS；
- MiMo 是 OpenAI 兼容接口，通常也不会为浏览器直连放开 `Authorization` 预检；
- 即使上游允许 CORS，把 Key 放在页面脚本里直连第三方仍会扩大 XSS 暴露面；
- 同源代理让前端只访问 `/api/fish`、`/api/mimo`，**彻底绕开 CORS**，Key 也不出现在 URL 中。

代理使用 Node 内置 `http` + `fetch` 实现，没有 Express 依赖（“Node/Express 极简后端”中的 Node 方案），因此离线也能启动、无需安装依赖。

### Key 如何流转

```
浏览器 localStorage
   │  Authorization: Bearer <key>（每次请求）
   ▼
同源代理 /api/fish 或 /api/mimo
   │  转发 Authorization
   ▼
Fish Audio / MiMo 上游
```

- Key 不写入服务端文件、日志或环境变量；
- 代理不保存请求体、响应体或 Key；
- 上游错误会以 JSON 形式回传（不含 Key），前端做本地化提示。

如果你想改成纯前端直连，需要先跑通 CORS 探测，再把 `public/js/api.js` 的请求地址改为上游 URL，并相应调整 `server.js` 的 CSP（`connect-src`）。**不推荐**在公开部署中这样做。

---

## 获取 API Key

### Fish Audio（主引擎，推荐）

1. 打开 <https://fish.audio/app/api-keys/>；
2. 免费注册（无需信用卡），创建一个 API Key；
3. 回到应用的设置页，粘贴到 **Fish Audio → API Key**；
4. 获取音色 ID：
   - 在 Fish Audio 音色库挑选公开音色，复制其 **Reference ID**；
   - 或使用免费档的语音克隆功能，克隆后复制自己的音色 ID；
   - 粘贴到合成页的 **Reference ID（必填）** 输入框。
5. 免费模型 Header 固定为 `s2.1-pro-free`。如需切换，修改 `server.js` 顶部的 `FISH_MODEL` 常量并重启。

内置的 `7f92f8afb8ec43bf81429cc1c9199cb1` 是 Fish Audio 官方文档中的示例音色 ID，可能失效；请以当前音色库为准。你也可以在应用里把任意音色“存为预设”，或在设置页添加多个预设。

**免费额度**：按 SPEC，S2.1 Pro 免费档为 Fair Use 不限量，促销期至 **2026-11-30**，之后可能调整或收费。以 Fish Audio 官方页面为准。

### MiMo TTS（备用引擎）

1. 打开 <https://platform.xiaomimimo.com>；
2. 注册账号（是否需要中国手机号未验证）；
3. 创建 API Key，粘贴到设置页 **MiMo TTS → API Key**；
4. 模型 ID 在设置页可配置，默认 `mimo-v2.5-tts`；
5. 在小米开放平台的“模型列表”中确认当前可用的 TTS 模型 ID。**V2.5 系列部分模型已于 2026-10-21 退役**，若遇到“模型不存在”，请改用平台当前提供的 ID（可能是 V2.6 系列）。

**免费额度**：V2.5 系列为限时免费，具体期限与配额以小米开放平台为准。本项目不保证模型长期可用。

---

## 使用说明

### 语速 / 音量如何生效

| 引擎 | 实现 |
| --- | --- |
| Fish Audio | 通过请求体 `prosody: { speed, volume }` 控制。音量百分比按 `20 × log10(percent / 100)` 转换为 dB（约 −20…+6 dB） |
| MiMo TTS | 通过一条 `user` 风格指令控制，例如“请用语速稍快（约 1.2 倍）、音量稍大朗读”。属于提示词控制，实际效果由模型决定 |

### 输出格式

- Fish Audio 默认 **MP3**，可切 WAV；
- MiMo 默认 **WAV**（与 SPEC 示例一致）；MP3 支持情况未经实测，如失败请切回 WAV；
- 实际下载扩展名会根据返回的 MIME / 文件头修正（支持 mp3 / wav / ogg）。

### 历史记录

- 最近 20 条，存放在 `localStorage`；
- 每条包含文本、引擎、音色、语速、音量、格式、大小和音频 Data URL；
- 音频较大，可能触发浏览器存储配额。发生配额不足时，应用会自动移除较旧记录的音频（保留文本等元数据），并在界面提示；
- 删除历史或在设置页清理不会影响浏览器中的其他站点数据。

---

## 错误排查

| 现象 | 可能原因 / 处理 |
| --- | --- |
| 401 / 403 | Key 无效、过期或没有该模型权限；到设置页检查并重新保存 |
| 402 / 429 | 免费额度耗尽或请求过频；查看账户额度，稍后重试 |
| 400（MiMo，含 “model”） | 模型 ID 不可用；到小米开放平台确认当前 TTS 模型 ID 并在设置页更新 |
| 400（Fish） | 常见为 `reference_id` 无效或文本为空；换一个音色 ID 重试 |
| “无法连接后端代理” | 页面是以静态方式打开的，或用错了端口；运行 `npm start` 后访问 `http://localhost:3000` |
| 网络错误 | 检查本机网络、代理、防火墙；服务器端能否访问两个上游 |
| 合成成功但没有声音 | 浏览器自动播放被拦截，点击播放器播放键；或检查系统音量 |
| 历史音频丢失 | localStorage 配额不足，旧音频被自动清理；重新合成即可 |
| 端口被占用 | `PORT=8080 npm start` |

错误详情（上游返回的技术信息）会显示在结果卡片中，便于定位。

---

## 安全与隐私

- **不硬编码**：代码中没有任何真实 API Key；
- **不提交**：`.gitignore` 已忽略 `.env`、`*.key` 等；构建过程未执行任何 git 提交或推送；
- **仅本地存储**：Key 存在 `localStorage`（`tts_free_settings_v1`），清除浏览器数据即消失；
- **同源代理**：服务端只在内存中转发 `Authorization`，不落盘、不打日志；
- **CSP**：页面使用严格 Content-Security-Policy（仅允许同源脚本/样式，媒体允许 blob/data），降低 XSS 风险；
- **公开部署注意**：代理会接受任何访问者提交的 Key 并用其调用固定上游。若部署到公网，请增加访问控制、限流与 HTTPS；不要把它当作开放代理。

---

## 项目结构

```
tts-is-free/
├── server.js              # 零依赖 Node 静态服务器 + Fish/MiMo 同源代理
├── package.json           # 无第三方依赖；start / test:cors / test:smoke
├── .gitignore             # 忽略 .env、日志、node_modules 等
├── SPEC.md                # 原始需求
├── README.md
├── public/
│   ├── index.html         # 合成主页面
│   ├── settings.html      # 设置页
│   ├── favicon.svg
│   ├── css/
│   │   └── styles.css     # 响应式、浅/深色主题
│   └── js/
│       ├── config.js      # 模型常量、音色、上限、链接
│       ├── i18n.js        # 中英文文案与切换
│       ├── store.js       # localStorage（设置/偏好/预设/历史）
│       ├── api.js         # 代理请求、base64 解码、错误类型
│       ├── app.js         # 主页面逻辑
│       └── settings.js    # 设置页逻辑
└── scripts/
    ├── cors-test.js       # 两个上游的 CORS 预检探测
    └── smoke-test.js      # 本地页面/静态资源/健康检查
```

### 验证命令

```bash
# 终端 1
npm start

# 终端 2
npm run test:smoke    # 检查页面、JS/CSS、/api/health
npm run test:cors     # 检查两个上游的 CORS 预检（需要出站网络）
```

---

## 已知限制与实现说明（含与 SPEC 的差异）

1. **后端是 Node 内置模块，不是 Express**：符合“极简 Node/Express 代理”的另一半，换来零依赖、无需 `npm install`。路由与功能保持等价。
2. **CORS 实测未能在此构建环境完成**：沙箱禁止出站网络和脚本执行。已提供 `npm run test:cors`；请在本机运行后按结果确认。应用默认走代理，因此不受该结果影响。
3. **未在构建环境完成真实 API 合成与浏览器 UI 手测**：没有 API Key 且网络受限。已提供烟测脚本和静态检查结果；请在本机按“验证命令”操作。
4. **Fish 音色预设**：只内置了官方文档示例 ID，未编造未经验证的“热门 ID”。用户可在设置页添加任意个真实 `reference_id` 作为预设。
5. **MiMo 模型 ID 可变**：默认 `mimo-v2.5-tts` 可随时在设置页改；若 V2.5 退役导致 404/400，请换用平台当前模型。
6. **MiMo 的 MP3 支持未经实测**：默认 WAV；如需 MP3，先试 WAV 再切。
7. **语速/音量精度**：Fish 走 `prosody`；MiMo 是自然语言风格指令，不保证精确倍率。
8. **非流式**：一次请求返回完整音频后再播放；长文本会有等待。
9. **免费额度随时可能变化**：本项目不缓存、不代理额度，完全依赖上游当前政策。
10. **历史音频受 localStorage 配额限制**：必要时会自动丢弃旧音频。

---

## 命令行 / MCP / Skill 调用

除了网页版，还可以用 CLI 或 MCP 服务器调用合成（零依赖，Node ≥ 20；完整说明见 `SKILL.md`）：

```bash
# CLI：Fish 合成
node bin/tts.js "你好世界" --engine fish --voice <reference_id> -o out.mp3
# CLI：MiMo 合成；文本也支持 --file 或管道 stdin
node bin/tts.js "Hello" --engine mimo --voice 冰糖 --format wav -o hello.wav

# MCP 服务器（stdio）：Claude Desktop 的 mcpServers 里配 command=node、args=[<仓库绝对路径>/mcp/server.js]，
# env 里放 FISH_API_KEY / MIMO_API_KEY；提供 tts_synthesize 与 tts_list_voices 两个工具
node mcp/server.js
```

Key 只从环境变量读（CLI 也可用 `--fish-key` / `--mimo-key` 显式传入），不要写进代码或提交。

---

## 官方默认额度 + 自定义 Key（双模式）与 Cloudflare 配置

本站有两种合成模式：

- **自定义 Key 模式**：浏览器在设置页填了 Key → 请求携带 `Authorization: Bearer <你的Key>`，使用你自己的账号；不占官方额度、不参与计数，行为与单 Key 版本完全一致。
- **官方额度模式**：浏览器不带 Authorization → Cloudflare Function 用保存在项目 secrets 里的官方 Key 代发请求。官方 Key 绝不下发给浏览器，代理只透传音频/错误。
  额度：**每个 IP 每个自然月 500 次成功合成**（Fish + MiMo 共用一池；只有上游成功返回音频才计数；调用前先查，超额直接 429 `official_quota_exceeded`，不请求上游）。
  计数存 KV（binding 名 `TTS_QUOTA_KV`，key 形如 `quota:<ip>:<YYYY-MM>`，下月自动过期重置）。
  容错 fail-closed：官方 Key 未配置 → 503 `official_key_missing`；KV 未绑定或读写失败 → 503 `official_quota_unavailable`。两种情况前端都会提示去设置页填自己的 Key。
  `/api/voices` 无 Key 时也回退官方 Key（公开列表，不检查也不计额度），打开就能用音色选择器。

### 部署者需要在 Cloudflare 后台做的事

1. **创建两个 secrets**（Pages 项目 → Settings → Environment variables → Add，类型选 Secret）：
   - `FISH_OFFICIAL_KEY`：你的 Fish Audio API Key
   - `MIMO_OFFICIAL_KEY`：你的 MiMo API Key
2. **创建并绑定 KV namespace**：Storage & Databases → KV namespaces → Create（名字随意，如 `tts-quota`）；回到 Pages 项目 Settings → Environment variables → KV namespace bindings，Variable name 必须填 `TTS_QUOTA_KV`，绑定到刚建的 namespace。
3. **重新部署一次**让绑定生效（见下方验证；wrangler 命令：`CLOUDFLARE_API_TOKEN=<token> npx wrangler pages deploy public --project-name tts-is-free`）。
4. **验证**：
   - 无 Key 调用合成应成功，且响应头 `X-Official-Quota-Remaining` 比上一次少 1（浏览器 DevTools Network 里看 `/api/fish` 响应头；或临时脚本连调两次对比）。
   - 无 `Authorization` 访问 `/api/voices` 应返回 200 音色列表。
   - 把同一 IP 的额度刷满 500 次后，第 501 次应返回 429 `{"error":"official_quota_exceeded"}`；此时带自己的 Key 仍应正常出音频。
   - 额度桶按自然月过期，下月 1 日自动重置。

本地 `server.js` 镜像同一逻辑：官方 Key 从 `process.env.FISH_OFFICIAL_KEY` / `MIMO_OFFICIAL_KEY` 读取，额度计数用进程内 Map（仅开发用，重启清零、多实例不共享；线上以 KV 为准）。`FISH_UPSTREAM_URL` / `MIMO_UPSTREAM_URL` / `FISH_MODELS_UPSTREAM_URL` 环境变量可把上游指向本地 mock，便于无真实 Key 验证双模式，默认仍指向官方 API 地址。

注意：改完 Cloudflare 后台配置（secrets / KV 绑定）后若官方模式未生效（503），**重新部署一次**（`wrangler pages deploy`）即可——Pages 的环境绑定在部署时快照。

---

## 免责声明

本项目按“现状”提供，不保证两个第三方 TTS 服务的可用性、免费政策或模型名称长期不变。使用前请阅读并遵守各自服务条款。API Key 的保管责任在用户本人。
