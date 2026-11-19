import fs from 'node:fs';
import crypto from 'node:crypto';

export async function fingerprint(filePath, signal, onProgress) {
  const before = await fs.promises.stat(filePath);
  if (!before.isFile()) throw new Error('请选择视频文件。');
  const hash = crypto.createHash('sha256');
  let read = 0, updated = 0;
  for await (const chunk of fs.createReadStream(filePath, { signal })) {
    hash.update(chunk); read += chunk.length;
    if (onProgress && (Date.now() - updated > 200 || read === before.size)) {
      onProgress({ current: read, total: before.size, percent: before.size ? read / before.size * 100 : 100 }); updated = Date.now();
    }
  }
  const after = await fs.promises.stat(filePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('视频在读取时发生变化，请重试。');
  return hash.digest('hex');
}

export function identify(records, hash, filePath) {
  const existing = records.find(item => item.hash === hash);
  return existing ? { ...existing, path: filePath } : {
    id: crypto.randomUUID(), hash, path: filePath, reports: [],
  };
}

export function validateReport(raw, duration) {
  const text = value => {
    if (typeof value !== 'string' || value.length > 100000) throw new Error('报告文本格式不正确，请重新分析。');
    return value;
  };
  if (!raw || !Array.isArray(raw.chapters) || !Array.isArray(raw.notes) || !Array.isArray(raw.materials)) throw new Error('模型返回了不完整的报告。');
  const segments = items => items.slice(0, 100).map(item => {
    if (!Number.isFinite(item.startSeconds) || !Number.isFinite(item.endSeconds) || item.startSeconds < 0 || item.endSeconds <= item.startSeconds || item.endSeconds > duration + 0.5) throw new Error('报告时间点超出视频范围，请重新分析。');
    return { title: text(item.title), text: text(item.text), startMs: Math.round(item.startSeconds * 1000), endMs: Math.min(Math.round(item.endSeconds * 1000), Math.round(duration * 1000)) };
  });
  if (!raw.notes.length) throw new Error('模型没有生成个人笔记。');
  return { title: text(raw.title), summary: text(raw.summary), chapters: segments(raw.chapters), materials: segments(raw.materials), notes: segments(raw.notes) };
}

export function markdown(report) {
  const time = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const sections = [['章节', report.chapters], ['观点与素材（整理文字）', report.materials], ['个人笔记', report.notes]];
  return `# ${report.title}\n\n${report.summary}\n\n` + sections.map(([title, items]) => `## ${title}\n\n` + items.map(item => `### ${item.title} [${time(item.startMs)}–${time(item.endMs)}]\n\n${item.text}`).join('\n\n')).join('\n\n') + '\n';
}
