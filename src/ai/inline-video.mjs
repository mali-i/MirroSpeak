import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

// Leave space for Base64 expansion, instructions and JSON under a 20 MB request.
export const INLINE_VIDEO_LIMIT = 12 * 1024 * 1024;
async function ffmpegPath() {
  const directories = [...(process.env.PATH || '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'].filter(Boolean);
  for (const directory of [...new Set(directories)]) {
    const candidate = path.join(directory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    try { await fs.promises.access(candidate, fs.constants.X_OK); return candidate; } catch { /* try next installed location */ }
  }
  throw new Error('此视频需要本地压缩，但未找到 ffmpeg。请先安装 ffmpeg，或使用小于 12 MB 的视频。');
}
export async function compressForInline({ filePath, duration, signal, progress }) {
  const binary = await ffmpegPath();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 900) throw new Error('内联视频支持最长 15 分钟。');
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'videolog-inline-'));
  const output = path.join(directory, 'analysis.mp4');
  const cleanup = () => fs.promises.rm(directory, { recursive: true, force: true });
  // Keep complete speech; spend remaining size budget on a low-frame-rate preview.
  const bitrate = Math.max(32, Math.min(700, Math.floor(11 * 1024 * 1024 * 8 / duration / 1000) - 40));
  try {
    signal?.throwIfAborted();
    await new Promise((resolve, reject) => {
      const child = spawn(binary, ['-nostdin', '-v', 'error', '-progress', 'pipe:1', '-nostats', '-protocol_whitelist', 'file,pipe', '-i', filePath, '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=320:320:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=2', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${bitrate}k`, '-maxrate', `${bitrate}k`, '-bufsize', `${bitrate * 2}k`, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '32k', '-ac', '1', '-ar', '16000', '-movflags', '+faststart', '-y', output], { signal, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
      let pending = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        pending += chunk;
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) {
          const match = line.match(/^out_time_us=(\d+)/);
          if (match) progress?.({ stage: 'prepare', message: '正在本地压缩视频副本，保留完整音频时长…', percent: Math.min(99, Number(match[1]) / (duration * 1000000) * 100) });
        }
      });
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error('本地视频压缩失败，请检查视频格式及 ffmpeg 的 H.264/AAC 支持。')));
    });
    signal?.throwIfAborted();
    const size = (await fs.promises.stat(output)).size;
    if (!size || size > INLINE_VIDEO_LIMIT) throw new Error('压缩后的视频仍超过内联体积上限，未发送 API 请求。请缩短视频或使用支持 Files API 的服务。');
    return { filePath: output, mimeType: 'video/mp4', compressed: true, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
export async function prepareInlineVideo({ filePath, duration, signal, progress }) {
  const size = (await fs.promises.stat(filePath)).size;
  if (size <= INLINE_VIDEO_LIMIT) return { filePath, mimeType: filePath.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4', compressed: false, cleanup: async () => {} };
  return compressForInline({ filePath, duration, signal, progress });
}
