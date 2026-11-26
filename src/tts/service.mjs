import fs from 'node:fs/promises';
import { normalizeWav } from './wav.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { request } from '../ai/qwen.mjs';
import { normalizeBaseUrl } from '../ai/endpoint.mjs';
export const TTS_MODEL = 'qwen-audio-3.1-tts-flash';
export const TTS_VOICE = 'longanhuan_v3.1';
const MAX_AUDIO = 16 * 1024 * 1024;
export function ttsEndpoint(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base.endsWith('/compatible-mode/v1')) throw new Error('朗读需要以 /compatible-mode/v1 结尾的百炼工作空间地址，请检查 AI 设置。');
  return base.slice(0, -'/compatible-mode/v1'.length) + '/api/v1/services/audio/tts/SpeechSynthesizer';
}
// Bailian can return signed OSS URLs with an HTTP scheme. OSS supports the
// same resource/signature over HTTPS; upgrade known OSS hosts without a retry.
export function normalizeAudioUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('语音服务未返回音频，请检查 TTS 模型权限及地域。');
  let url;
  try { url = new URL(value); } catch { throw new Error('语音下载地址格式无效。'); }
  if (url.username || url.password || url.hash) throw new Error('语音下载地址无效。');
  if (url.protocol === 'http:' && !url.port && /^[a-z0-9][a-z0-9.-]*\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(url.hostname)) url.protocol = 'https:';
  if (url.protocol !== 'https:') throw new Error('语音下载地址未使用 HTTPS，且不是可安全转换的阿里云 OSS 地址。');
  return url;
}
async function boundedBytes(response, max, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('语音服务返回空内容。');
  const chunks = []; let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error('语音响应过大，请缩短朗读内容。');
      chunks.push(Buffer.from(value));
    }
    const declared = response.headers.get('content-length');
    if (!response.headers.get('content-encoding') && declared !== null && /^\d+$/.test(declared) && Number(declared) !== size) throw new Error('HTTP 响应未完整下载。');
    return Buffer.concat(chunks);
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}
async function trimCache(dir) {
  const entries = await fs.readdir(dir);
  const files = await Promise.all(entries.filter(name => /^[a-f0-9]{64}\.wav$/.test(name)).map(async name => ({ name, ...(await fs.stat(path.join(dir, name))) })));
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
    if (total <= 128 * 1024 * 1024) break;
    await fs.unlink(path.join(dir, file.name)); total -= file.size;
  }
}
export async function synthesize({ text, baseUrl, apiKey, cacheDir, signal, fetchAudio }) {
  if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 240) throw new Error('朗读文本无效。');
  const endpoint = ttsEndpoint(baseUrl);
  const hash = crypto.createHash('sha256').update(JSON.stringify([endpoint, TTS_MODEL, TTS_VOICE, text, 'wav', 24000])).digest('hex');
  const target = path.join(cacheDir, hash + '.wav');
  signal?.throwIfAborted();
  try {
    const stats = await fs.stat(target);
    if (stats.size <= MAX_AUDIO) {
      const audio = await fs.readFile(target);
      try { return { audio: new Uint8Array(normalizeWav(audio)), cached: true }; } catch { /* invalid legacy cache: synthesize again */ }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('无法读取本地朗读缓存。'); }
  const response = await request(apiKey, endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, input: { text, voice: TTS_VOICE, format: 'wav', sample_rate: 24000 } }),
    signal, stage: '生成朗读', streamResponse: true, maxResponseBytes: 1024 * 1024 });
  let result;
  try { result = JSON.parse((await boundedBytes(response, 1024 * 1024, signal)).toString()); }
  catch (error) { signal?.throwIfAborted(); throw new Error('语音服务返回格式无效，请手动重试。'); }
  const url = normalizeAudioUrl(result?.output?.audio?.url);
  // Signed audio URLs are fetched without the API Key or cookies, and never redirected.
  let download;
  try { download = await fetchAudio(url.href, { redirect: 'error', credentials: 'omit', signal, streamResponse: true, maxResponseBytes: MAX_AUDIO }); }
  catch { signal?.throwIfAborted(); throw new Error('朗读音频下载失败，请手动重试。'); }
  if (!download.ok) { await download.body?.cancel().catch(() => {}); throw new Error(`朗读音频下载失败（HTTP ${download.status}）。`); }
  let audio;
  try { audio = await boundedBytes(download, MAX_AUDIO, signal); }
  catch { signal?.throwIfAborted(); throw new Error('朗读音频下载未完成或过大，请手动重试。'); }
  audio = normalizeWav(audio);
  signal?.throwIfAborted();
  await fs.mkdir(cacheDir, { recursive: true });
  const temporary = target + '.' + crypto.randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, audio, { mode: 0o600 }); signal?.throwIfAborted(); await fs.rename(temporary, target); }
  finally { await fs.rm(temporary, { force: true }); }
  await trimCache(cacheDir).catch(() => {});
  return { audio: new Uint8Array(audio), cached: false };
}
