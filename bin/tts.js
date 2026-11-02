#!/usr/bin/env node
'use strict';

// TTS is free 命令行工具：零依赖，只用 Node 内置模块。
// 用法：node bin/tts.js "你好世界" --engine fish --voice <reference_id> -o out.mp3
// 文本来源优先级：--file > 命令行位置参数（多个会用空格连接）> 管道 stdin。
// Key 来源：环境变量 FISH_API_KEY / MIMO_API_KEY，或 --fish-key / --mimo-key
// 显式传入。Key 绝不会被打印到输出或写入文件。

const fs = require('node:fs');
const path = require('node:path');
const { synthesize, TtsError } = require('../lib/tts-core');

const USAGE = `TTS is free · 命令行合成工具

用法：
  node bin/tts.js "文本" [选项]
  node bin/tts.js --file input.txt [选项]
  echo "文本" | node bin/tts.js [选项]

选项：
  --engine <fish|mimo>     合成引擎，默认 fish
  --voice <id>             Fish 音色 reference_id（fish 必填）；MiMo 为音色名，可空
  --format <mp3|wav>       输出格式，默认 mp3
  --speed <0.5-2>          语速倍数，默认 1
  --volume <10-200>        音量百分比，默认 100
  -o, --output <path>      输出文件路径；默认当前目录 tts-<时间戳>.<格式>
  --fish-key <key>         Fish API Key（优先于环境变量）
  --mimo-key <key>         MiMo API Key（优先于环境变量）
  --mimo-model <model>     MiMo 模型，默认 mimo-v2.5-tts
  -h, --help               显示本帮助

环境变量：
  FISH_API_KEY             Fish API Key（https://fish.audio/app/api-keys/ 申请，免费）
  MIMO_API_KEY             MiMo API Key

示例：
  node bin/tts.js "你好世界" --engine fish --voice <reference_id> -o out.mp3
  node bin/tts.js "Hello" --engine mimo --voice 冰糖 --format wav -o hello.wav
`;

function fail(message, showUsage = false) {
  console.error(`错误：${message}`);
  if (showUsage) console.error(`\n${USAGE}`);
  process.exit(1);
}

// 简单参数解析：支持 --key value、--key=value、-o value、-h；其余为文本。
function parseArgs(argv) {
  const opts = {
    engine: 'fish',
    format: 'mp3',
    speed: 1,
    volume: 100,
    output: '',
    fishKey: '',
    mimoKey: '',
    mimoModel: '',
    file: '',
    help: false
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const takeValue = (name) => {
      const eq = arg.indexOf('=');
      if (eq !== -1) return arg.slice(eq + 1);
      if (i + 1 >= argv.length) fail(`选项 ${name} 缺少取值。`, true);
      i += 1;
      return argv[i];
    };
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--engine' || arg.startsWith('--engine=')) opts.engine = takeValue('--engine');
    else if (arg === '--voice' || arg.startsWith('--voice=')) opts.voice = takeValue('--voice');
    else if (arg === '--format' || arg.startsWith('--format=')) opts.format = takeValue('--format');
    else if (arg === '--speed' || arg.startsWith('--speed=')) opts.speed = Number(takeValue('--speed'));
    else if (arg === '--volume' || arg.startsWith('--volume=')) opts.volume = Number(takeValue('--volume'));
    else if (arg === '-o' || arg === '--output' || arg.startsWith('--output=')) opts.output = takeValue('--output');
    else if (arg === '--fish-key' || arg.startsWith('--fish-key=')) opts.fishKey = takeValue('--fish-key');
    else if (arg === '--mimo-key' || arg.startsWith('--mimo-key=')) opts.mimoKey = takeValue('--mimo-key');
    else if (arg === '--mimo-model' || arg.startsWith('--mimo-model=')) opts.mimoModel = takeValue('--mimo-model');
    else if (arg === '--file' || arg.startsWith('--file=')) opts.file = takeValue('--file');
    else if (arg.startsWith('-')) fail(`未知选项：${arg}。`, true);
    else positionals.push(arg);
  }
  opts.text = positionals.join(' ');
  return opts;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  let text = '';
  if (opts.file) {
    try {
      text = fs.readFileSync(opts.file, 'utf8');
    } catch (err) {
      fail(`读取文本文件失败：${opts.file}（${err.message}）。`);
    }
  } else if (opts.text) {
    text = opts.text;
  } else if (!process.stdin.isTTY) {
    text = await readStdin();
  }
  text = text.trim();
  if (!text) fail('缺少合成文本：请传入文本、--file，或通过管道 stdin 输入。', true);

  const engine = opts.engine === 'mimo' ? 'mimo' : opts.engine === 'fish' ? 'fish' : '';
  if (!engine) fail(`不支持的引擎：${opts.engine}（仅支持 fish / mimo）。`, true);
  const format = opts.format === 'wav' ? 'wav' : opts.format === 'mp3' ? 'mp3' : '';
  if (!format) fail(`不支持的格式：${opts.format}（仅支持 mp3 / wav）。`, true);

  const key = engine === 'fish' ? opts.fishKey || process.env.FISH_API_KEY || '' : opts.mimoKey || process.env.MIMO_API_KEY || '';
  if (!key) {
    fail(
      engine === 'fish'
        ? '缺少 Fish API Key：请设置环境变量 FISH_API_KEY，或用 --fish-key 传入。'
        : '缺少 MiMo API Key：请设置环境变量 MIMO_API_KEY，或用 --mimo-key 传入。'
    );
  }

  const voice = opts.voice || '';
  let audio;
  try {
    audio = await synthesize({
      engine,
      text,
      referenceId: voice,
      voice,
      format,
      speed: opts.speed,
      volume: opts.volume,
      key,
      model: opts.mimoModel || undefined
    });
  } catch (err) {
    if (err instanceof TtsError) fail(err.message);
    fail(`合成失败：${err.message}`);
  }

  const output = opts.output || path.join(process.cwd(), `tts-${Date.now()}.${format}`);
  try {
    fs.writeFileSync(output, audio);
  } catch (err) {
    fail(`写入输出文件失败：${output}（${err.message}）。`);
  }
  // 只打印结果摘要，不打印 Key 或文本内容。
  console.log(
    JSON.stringify({ ok: true, engine, voice: voice || null, format, bytes: audio.length, path: output })
  );
}

main().catch((err) => fail(`运行失败：${err && err.message ? err.message : err}`));
