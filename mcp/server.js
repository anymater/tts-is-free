#!/usr/bin/env node
'use strict';

// TTS is free MCP 服务器：stdio JSON-RPC，手写协议，零依赖。
// 启动：node mcp/server.js（不接受命令行参数，不打印 Key）。
// Key 只从环境变量读：FISH_API_KEY / MIMO_API_KEY。
// 实现的方法：initialize、ping、tools/list、tools/call；
// 通知（如 notifications/initialized）按协议不回包。
// stdout 只输出 JSON-RPC 回包，一行一条；其它日志一律不打。

const fs = require('node:fs');
const path = require('node:path');
const { synthesize, listFishVoices, TtsError } = require('../lib/tts-core');

const SERVER_NAME = 'tts-is-free';
const SERVER_VERSION = '1.0.0';

const TOOLS = [
  {
    name: 'tts_synthesize',
    description: '把文本合成为语音并写入文件。Fish 为主引擎（需要 voice=reference_id），MiMo 为备用引擎。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要合成的文本（最多 5000 字符）' },
        engine: { type: 'string', enum: ['fish', 'mimo'], description: '合成引擎，默认 fish' },
        voice: { type: 'string', description: 'Fish 音色 reference_id；MiMo 为音色名，可空' },
        reference_id: { type: 'string', description: 'voice 的别名，Fish 音色 reference_id' },
        format: { type: 'string', enum: ['mp3', 'wav'], description: '输出格式，默认 mp3' },
        speed: { type: 'number', description: '语速倍数 0.5–2，默认 1' },
        volume: { type: 'number', description: '音量百分比 10–200，默认 100' },
        output_path: { type: 'string', description: '输出文件路径；为空时默认写当前目录 tts-<时间戳>.<格式>' },
        mimo_model: { type: 'string', description: 'MiMo 模型，默认 mimo-v2.5-tts' }
      },
      required: ['text']
    }
  },
  {
    name: 'tts_list_voices',
    description: '列出 Fish Audio 音色库（精简字段），用于挑选 reference_id。需要 FISH_API_KEY。',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', description: '语言过滤，如 zh' },
        tag: { type: 'string', description: '标签过滤，如 female / male' },
        query: { type: 'string', description: '按标题模糊搜索' },
        limit: { type: 'number', description: '返回条数 1–50，默认 20' }
      }
    }
  }
];

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function result(id, resultObj) {
  send({ jsonrpc: '2.0', id, result: resultObj });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

// 工具执行结果：成功与可读失败都以 content 回包（isError 标记失败），
// 这样调用方 agent 能拿到错误文本而不是协议层报错。
function toolText(payload, isError = false) {
  const res = { content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] };
  if (isError) res.isError = true;
  return res;
}

async function callSynthesize(args) {
  const text = typeof args.text === 'string' ? args.text : '';
  const engine = args.engine === 'mimo' ? 'mimo' : 'fish';
  const voice = args.voice || args.reference_id || '';
  const format = args.format === 'wav' ? 'wav' : 'mp3';
  const speed = args.speed === undefined ? 1 : Number(args.speed);
  const volume = args.volume === undefined ? 100 : Number(args.volume);
  const key = engine === 'fish' ? process.env.FISH_API_KEY || '' : process.env.MIMO_API_KEY || '';

  const audio = await synthesize({
    engine,
    text,
    referenceId: voice,
    voice,
    format,
    speed,
    volume,
    key,
    model: args.mimo_model || undefined
  });

  const outputPath =
    typeof args.output_path === 'string' && args.output_path.trim()
      ? args.output_path.trim()
      : path.join(process.cwd(), `tts-${Date.now()}.${format}`);
  fs.writeFileSync(outputPath, audio);
  return { engine, voice: voice || null, format, bytes: audio.length, path: outputPath };
}

async function callListVoices(args) {
  return listFishVoices({
    key: process.env.FISH_API_KEY || '',
    language: typeof args.language === 'string' ? args.language : '',
    tag: typeof args.tag === 'string' ? args.tag : '',
    query: typeof args.query === 'string' ? args.query : '',
    limit: args.limit === undefined ? 20 : Number(args.limit)
  });
}

async function handleToolsCall(params) {
  const name = params?.name;
  const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
  try {
    if (name === 'tts_synthesize') return toolText(await callSynthesize(args));
    if (name === 'tts_list_voices') return toolText(await callListVoices(args));
    return toolText(`未知工具：${name}（可用工具：tts_synthesize、tts_list_voices）。`, true);
  } catch (err) {
    // 缺 Key、上游失败、参数非法都落到这里：返回可读错误，不崩溃。
    return toolText(err instanceof TtsError ? err.message : `工具执行失败：${err.message}`, true);
  }
}

async function handleMessage(msg) {
  // 通知（无 id）不需要回包。
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return;
  const isRequest = msg.id !== undefined && msg.id !== null;
  if (!isRequest) return;

  const method = msg.method;
  if (method === 'initialize') {
    result(msg.id, {
      protocolVersion: msg.params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
    });
    return;
  }
  if (method === 'ping') {
    result(msg.id, {});
    return;
  }
  if (method === 'tools/list') {
    result(msg.id, { tools: TOOLS });
    return;
  }
  if (method === 'tools/call') {
    result(msg.id, await handleToolsCall(msg.params || {}));
    return;
  }
  error(msg.id, -32601, `不支持的方法：${method}`);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      error(null, -32700, '请求不是合法 JSON。');
      continue;
    }
    handleMessage(msg).catch((err) => {
      // 兜底：处理函数本身不应抛错，万一抛了也不要让 server 挂掉。
      if (msg && msg.id !== undefined && msg.id !== null) {
        error(msg.id, -32603, `内部错误：${err.message}`);
      }
    });
  }
});
