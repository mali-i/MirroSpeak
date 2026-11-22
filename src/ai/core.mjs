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
  const text = (value, field) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 100000) throw new Error(`报告字段 ${field} 必须是非空字符串，且不超过 100000 字符。`);
    return value.trim();
  };
  const list = (value, max = 100) => {
    if (!Array.isArray(value) || value.length > max) throw new Error('报告列表格式或数量无效。');
    return value;
  };
  const sources = value => {
    const ranges = list(value, 20);
    if (!ranges.length) throw new Error('报告缺少来源时间。');
    return ranges.map(range => {
      if (!range || !Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds) || range.startSeconds < 0 || range.endSeconds <= range.startSeconds || range.endSeconds > duration) throw new Error('报告时间点超出视频范围，请重新分析。');
      const startMs = Math.round(range.startSeconds * 1000), endMs = Math.round(range.endSeconds * 1000);
      if (endMs <= startMs) throw new Error('报告来源时间范围过短。');
      return { startMs, endMs };
    });
  };
  if (!raw || raw.schemaVersion !== 2) throw new Error('报告格式版本无效，请重新分析。');
  if (!list(raw.notes).length) throw new Error('模型没有生成个人笔记。');
  // A paragraph array is equivalent to a body string; preserve every paragraph.
  const body = (value, field) => {
    if (Array.isArray(value) && value.length && value.length <= 100) {
      value = value.map((paragraph, index) => text(paragraph, `${field}[${index}]`)).join('\n\n');
    }
    return text(value, field);
  };
  const entry = (item, field) => ({ title: text(item?.title, `${field}.title`), text: body(item?.text, `${field}.text`), sources: sources(item?.sources) });
  return {
    schemaVersion: 2, title: text(raw.title, 'title'), summary: text(raw.summary, 'summary'),
    notes: raw.notes.map((item, index) => ({ ...entry(item, `notes[${index}]`), takeaway: text(item.takeaway, `notes[${index}].takeaway`) })),
    materials: list(raw.materials).map((item, index) => {
      if (!['观点', '案例', '方法'].includes(item?.type)) throw new Error('素材类型无效。');
      return { ...entry(item, `materials[${index}]`), type: item.type };
    }),
    uncertainties: list(raw.uncertainties).map((item, index) => entry(item, `uncertainties[${index}]`)),
  };
}

export function markdown(report) {
  const time = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const sources = item => item.sources.map(range => `${time(range.startMs)}–${time(range.endMs)}`).join('、');
  const sections = [['主题笔记', report.notes], ['可复用素材', report.materials], ['待确认内容', report.uncertainties]];
  return `# ${report.title}\n\n${report.summary}\n\n` + sections.map(([title, items]) => `## ${title}\n\n` + (items.length ? items.map(item => `### ${item.type ? `【${item.type}】` : ''}${item.title}\n\n来源：${sources(item)}\n\n${item.takeaway ? item.takeaway + '\n\n' : ''}${item.text}`).join('\n\n') : '无')).join('\n\n') + '\n';
}
