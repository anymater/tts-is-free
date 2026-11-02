# TTS is free · CLI / MCP / Skill

用命令行或 AI 助手（MCP）调用 TTS is free 的 Fish / MiMo 合成功能，不用打开网页。零依赖，只需要 Node.js ≥ 20。仓库内的网页版不受影响。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `FISH_API_KEY` | Fish Audio Key（主引擎）。申请地址：https://fish.audio/app/api-keys/（免费） |
| `MIMO_API_KEY` | MiMo Key（备用引擎） |

Key 只从环境变量读（CLI 也可用 `--fish-key` / `--mimo-key` 显式传入）。**不要把真实 Key 写进代码、提交或日志。**

## CLI

```bash
# Fish 合成（reference_id 从网站音色选择器或 tts_list_voices 工具里挑）
node bin/tts.js "你好世界" --engine fish --voice <reference_id> -o out.mp3

# MiMo 合成
node bin/tts.js "Hello" --engine mimo --voice 冰糖 --format wav -o hello.wav

# 文本来源：--file 优先；其次命令行参数（多个会用空格连接）；最后是管道 stdin
node bin/tts.js --file input.txt --voice <reference_id> -o out.mp3
echo "你好" | node bin/tts.js --voice <reference_id> -o out.mp3

# 完整选项
node bin/tts.js --help
```

常用选项：`--engine fish|mimo`（默认 fish）、`--voice <id>`、`--format mp3|wav`（默认 mp3）、`--speed 0.5–2`（默认 1）、`--volume 10–200`（默认 100，百分比）、`-o/--output <路径>`（默认当前目录 `tts-<时间戳>.<格式>`）。

成功时打印一行 JSON 摘要：`{"ok":true,"engine":"fish","voice":"…","format":"mp3","bytes":12345,"path":"out.mp3"}`。

## MCP 服务器

stdio JSON-RPC 服务器，手写协议，零依赖。启动命令：

```bash
node mcp/server.js
```

### Claude Desktop 配置

在 Claude Desktop 的配置文件中加入（路径按你的系统调整，Windows 用绝对路径）：

```json
{
  "mcpServers": {
    "tts-is-free": {
      "command": "node",
      "args": ["/绝对路径/tts-is-free/mcp/server.js"],
      "env": {
        "FISH_API_KEY": "你的 Fish Key",
        "MIMO_API_KEY": "你的 MiMo Key"
      }
    }
  }
}
```

### 工具

- `tts_synthesize`：合成并写文件。参数：`text`（必填）、`engine`（fish/mimo，默认 fish）、`voice` 或 `reference_id`（Fish 必填）、`format`（mp3/wav，默认 mp3）、`speed`（0.5–2）、`volume`（10–200）、`output_path`（为空时默认写当前目录 `tts-<时间戳>.<格式>`）、`mimo_model`（默认 mimo-v2.5-tts）。返回 `{engine, voice, format, bytes, path}`。
- `tts_list_voices`：列出 Fish 音色库精简字段 `{id, title, tags, task_count}`，用于挑选 `reference_id`。参数：`language`（如 zh）、`tag`（如 female / male）、`query`（标题搜索）、`limit`（1–50，默认 20）。

## 常见错误

| 现象 | 原因与处理 |
| --- | --- |
| 缺少 Fish/MiMo API Key | 设置对应的环境变量，或 CLI 用 `--fish-key` / `--mimo-key` 传入 |
| Fish 引擎需要音色 reference_id | 用 `--voice` 传入，或先用 `tts_list_voices` / 网站音色选择器挑一个 |
| 不支持的格式/引擎/语速/音量 | 格式仅 mp3/wav；引擎仅 fish/mimo；语速 0.5–2；音量 10–200 |
| 合成失败（HTTP 4xx/5xx） | 多为 Key 无效或额度不足：检查 Key、换引擎重试，或去网站设置页确认 Key |
| 参数错误 | CLI 退出码非零并打印用法；MCP 返回 `isError: true` 的可读错误，不会崩溃 |
