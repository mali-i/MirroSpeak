import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const directories = () => [...new Set([...(process.env.PATH || '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/Library/Frameworks/Python.framework/Versions/3.13/bin'].filter(Boolean))];
async function executable(name) {
  for (const directory of directories()) {
    const candidate = path.join(directory, name);
    try { await fs.access(candidate, 1); return candidate; } catch { /* next */ }
  }
  throw new Error(`本地语音转写需要 ${name}，请先安装后重试；未调用云端模型。`);
}
const worker = String.raw`
import json, sys, whisper, torch
# Limit CPU oversubscription on desktop machines.
torch.set_num_threads(4)
print('STAGE:model', flush=True)
model = whisper.load_model('base', device='cpu', download_root=sys.argv[2])
print('STAGE:transcribe', flush=True)
result = model.transcribe(sys.argv[1], language='zh', task='transcribe', fp16=False, verbose=False, condition_on_previous_text=False)
with open(sys.argv[3], 'w', encoding='utf-8') as f:
    json.dump({'model': 'base', 'segments': [{'start': s['start'], 'end': s['end'], 'text': s['text']} for s in result['segments']]}, f, ensure_ascii=False)
`;
function run(binary, args, { signal, onOutput = () => {}, failure }) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, PATH: directories().join(path.delimiter) } });
    let stopped = false;
    const abort = () => { stopped = true; child.kill('SIGTERM'); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on('data', chunk => onOutput(chunk.toString()));
    child.stderr.on('data', chunk => onOutput(chunk.toString()));
    child.on('error', () => { signal?.removeEventListener('abort', abort); reject(new Error(failure)); });
    child.on('close', code => {
      signal?.removeEventListener('abort', abort);
      if (stopped) { reject(signal.reason || new DOMException('Cancelled', 'AbortError')); return; }
      if (code !== 0) reject(new Error(failure)); else resolve();
    });
  });
}
export function transcriptText(transcript, duration) {
  if (!Array.isArray(transcript?.segments) || transcript.segments.length > 10000) throw new Error('本地转写结果格式无效。');
  const lines = transcript.segments.map(s => {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || s.start >= duration || s.end > duration + 1 || typeof s.text !== 'string') throw new Error('本地转写时间点无效，未提交云端模型。');
    return s.text.trim() ? `[${s.start.toFixed(2)}–${Math.min(s.end, duration).toFixed(2)} 秒] ${s.text.trim()}` : '';
  }).filter(Boolean);
  const text = lines.join('\n');
  if (!text) throw new Error('本地未识别到可用讲话内容，未提交云端模型。请检查原视频是否有清晰声音。');
  if (text.length > 100000) throw new Error('本地转写文字过长，未提交云端模型。');
  return text;
}
const MODEL_HASH = 'ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e';
async function ensureModel(cacheDir, fetchModel, signal, progress) {
  const modelDir = path.join(cacheDir, 'models');
  await fs.mkdir(modelDir, { recursive: true });
  const target = path.join(modelDir, 'base.pt');
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(target)) { signal?.throwIfAborted(); hash.update(chunk); }
    if (hash.digest('hex') === MODEL_HASH) return;
  } catch { signal?.throwIfAborted(); }
  progress({ stage: 'transcribe', message: '首次使用：正在下载 Whisper base 语音模型（约 140 MiB）…' });
  const response = await fetchModel(`https://openaipublic.azureedge.net/main/whisper/models/${MODEL_HASH}/base.pt`, { signal, redirect: 'error', streamResponse: true, maxResponseBytes: 160 * 1024 * 1024 });
  if (!response.ok || !response.body) throw new Error('本地语音模型下载失败，请检查系统代理后重试。');
  const partial = target + '.' + randomUUID() + '.partial';
  const output = await fs.open(partial, 'wx', 0o600);
  const hash = createHash('sha256');
  let received = 0, last = 0;
  try {
    for await (const chunk of response.body) {
      signal?.throwIfAborted();
      received += chunk.length;
      if (received > 160 * 1024 * 1024) throw new Error('语音模型下载超过大小上限。');
      hash.update(chunk); await output.writeFile(chunk);
      if (Date.now() - last > 500) { progress({ stage: 'transcribe', message: `正在下载本地语音模型，已收到 ${(received / 1024 / 1024).toFixed(1)} MiB…` }); last = Date.now(); }
    }
    if (hash.digest('hex') !== MODEL_HASH) throw new Error('语音模型文件校验失败，请重试下载。');
    await output.close(); await fs.rename(partial, target);
  } finally { await output.close().catch(() => {}); await fs.rm(partial, { force: true }); }
}

export async function transcribeLocal({ filePath, duration, signal, progress = () => {}, cacheDir = path.join(os.tmpdir(), 'mirrospeak-speech'), sourceHash, fetchModel = globalThis.fetch }) {
  const cachedFile = /^[a-f0-9]{64}$/.test(sourceHash || '') ? path.join(cacheDir, `${sourceHash}-base-v1.json`) : null;
  if (cachedFile) {
    try {
      const transcript = JSON.parse(await fs.readFile(cachedFile, 'utf8'));
      const text = transcriptText(transcript, duration);
      signal?.throwIfAborted();
      progress({ stage: 'transcribe', message: '已读取本机缓存的讲话转写，无需重新识别。' });
      return { text, engine: 'whisper', model: 'base', cached: true };
    } catch (error) { signal?.throwIfAborted(); /* retry invalid/missing local cache */ }
  }
  const ffmpeg = await executable('ffmpeg');
  const whisper = await executable('whisper');
  const shebang = (await fs.readFile(whisper, 'utf8')).split('\n')[0].replace(/^#!/, '').trim();
  const python = shebang.startsWith('/') && !shebang.includes(' ') ? shebang : await executable('python3');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mirrospeak-transcribe-'));
  const audio = path.join(directory, 'speech.wav'), output = path.join(directory, 'transcript.json');
  try {
    progress({ stage: 'transcribe', message: '正在从原视频提取音轨，在本机转写讲话内容…' });
    await run(ffmpeg, ['-nostdin', '-v', 'error', '-i', filePath, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', audio], { signal, failure: '无法提取原视频音轨。请确认视频包含可播放的声音；未调用云端模型。' });
    await ensureModel(cacheDir, fetchModel, signal, progress);
    let lastUpdate = 0;
    await run(python, ['-u', '-c', worker, audio, path.join(cacheDir, 'models'), output], {
      signal, failure: '本地 Whisper 转写失败。请检查 Python 的 openai-whisper 安装及模型下载网络；未调用云端模型。',
      onOutput(value) {
        if (value.includes('STAGE:model')) progress({ stage: 'transcribe', message: '正在加载 Whisper base；首次使用需下载约 140 MiB 模型，随后可离线转写…' });
        if (value.includes('STAGE:transcribe')) progress({ stage: 'transcribe', message: 'Whisper 正在本机识别讲话；不会调用云端语音识别 API…' });
        if (Date.now() - lastUpdate > 1000 && /\d+%/.test(value)) { progress({ stage: 'transcribe', message: '本地语音模型正在下载或识别，请稍候…', lastActivityAt: Date.now() }); lastUpdate = Date.now(); }
      },
    });
    signal?.throwIfAborted();
    const transcript = JSON.parse(await fs.readFile(output, 'utf8'));
    const text = transcriptText(transcript, duration);
    if (cachedFile) await fs.writeFile(cachedFile, JSON.stringify(transcript), { mode: 0o600 });
    return { text, engine: 'whisper', model: 'base', cached: false };
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
