import { app, ipcMain, dialog, safeStorage } from 'electron';
import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fingerprint, identify, markdown } from './core.mjs';
import { analyze, checkConnection, removeRemote, setRequestTransport } from './gemini.mjs';
import { DEFAULT_BASE_URL, normalizeBaseUrl } from './endpoint.mjs';

// Separate from generic renderer-accessible configuration.
const database = new Store({ name: 'video-notes' });
const records = () => database.get('videos', []);
const writeRecord = record => database.set('videos', [...records().filter(item => item.id !== record.id), record]);
export function linkedAccess(targetPath) {
  return database.get('access', []).find(item => path.resolve(item.path) === path.resolve(targetPath)) || null;
}
const key = () => {
  const value = database.get('encryptedKey');
  if (!value || !safeStorage.isEncryptionAvailable()) throw new Error('请先在设置中保存 API Key。');
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
};
const configuredBaseUrl = () => normalizeBaseUrl(database.get('baseUrl', DEFAULT_BASE_URL));
// Older cleanup entries were uploaded to the official service. Never reroute them to a new proxy.
const pendingCleanup = () => database.get('pendingCleanup', []).map(item => typeof item === 'string' ? { name: item, baseUrl: DEFAULT_BASE_URL } : item);
const publicSettings = () => ({ baseUrl: configuredBaseUrl(), model: database.get('model', 'gemini-3.8-flash'), hasKey: !!database.get('encryptedKey'), secureStorage: safeStorage.isEncryptionAvailable() });
export function movedVideo(sourcePath, targetPath) {
  for (const record of records()) {
    if (record.path === sourcePath) writeRecord({ ...record, path: targetPath, name: path.basename(targetPath) });
  }
}
let active = null;

export function registerAI({ withDirectoryAccess, getDirectoryAccessForPath, fetch: fetchImpl }) {
  if (fetchImpl) setRequestTransport(fetchImpl);
  const handle = (name, fn) => ipcMain.handle(`ai:${name}`, async (event, data) => {
    try { return { success: true, data: await fn(data, event) }; }
    catch (error) { return { success: false, error: error.name === 'AbortError' ? '任务已取消。' : error.name === 'TimeoutError' ? '任务超时，请手动重试。' : error.message }; }
  });
  const checkedPath = async target => {
    if (typeof target !== 'string' || !/\.(mp4|webm)$/i.test(target)) throw new Error('请选择 MP4 或 WebM 视频。');
    const resolved = await fs.promises.realpath(target);
    if (!getDirectoryAccessForPath(resolved) && !linkedAccess(resolved)) throw new Error('请在视频库中选择视频或使用“重新定位”授权文件。');
    return resolved;
  };
  const resolve = async (target, signal) => {
    return withDirectoryAccess(target, async () => {
      const filePath = await checkedPath(target);
      const hash = await fingerprint(filePath, signal);
      const record = identify(records(), hash, filePath);
      record.name = path.basename(filePath);
      writeRecord(record);
      return record;
    });
  };
  const flushCleanup = async (apiKey, baseUrl) => {
    const remaining = [];
    for (const item of pendingCleanup()) {
      if (item.baseUrl !== baseUrl) { remaining.push(item); continue; }
      try { await removeRemote(apiKey, item.name, item.baseUrl); } catch { remaining.push(item); }
    }
    database.set('pendingCleanup', remaining);
    return remaining.length;
  };
  handle('settings', () => publicSettings());
  handle('configure', ({ apiKey, model, baseUrl = DEFAULT_BASE_URL }) => {
    if (active) throw new Error('请等待当前任务结束后再修改配置。');
    if (typeof model !== 'string' || !/^gemini-[a-zA-Z0-9._-]+$/.test(model.trim())) throw new Error('请输入有效的 Gemini 模型名称。');
    const normalizedBase = normalizeBaseUrl(baseUrl);
    if (normalizedBase !== configuredBaseUrl() && database.get('encryptedKey') && !apiKey?.trim()) throw new Error('更换 Base URL 时请重新填写对应的 API Key。');
    if (apiKey) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法保存 Key。');
      if (typeof apiKey !== 'string' || apiKey.length > 500) throw new Error('API Key 格式无效。');
      database.set('encryptedKey', safeStorage.encryptString(apiKey.trim()).toString('base64'));
    }
    database.set('baseUrl', normalizedBase);
    database.set('model', model.trim());
    return publicSettings();
  });
  handle('forget-key', () => {
    if (active) throw new Error('请先取消当前任务。');
    database.delete('encryptedKey');
  });
  handle('test', async () => {
    const apiKey = key();
    const model = database.get('model', 'gemini-3.8-flash');
    const baseUrl = configuredBaseUrl();
    const message = await checkConnection(apiKey, baseUrl, model);
    const pending = await flushCleanup(apiKey, baseUrl);
    return { message: `基础连接测试通过。${message}${pending ? '仍有远端临时文件未清理；请使用上传时的 Base URL 和 Key 再次测试连接重试。' : ''}` };
  });
  handle('library', () => records().filter(item => item.reports.length).map(item => ({ id: item.id, name: item.name, path: item.path, reportCount: item.reports.length })));
  handle('open', async ({ filePath, id }) => {
    if (filePath) return resolve(filePath);
    const record = records().find(item => item.id === id);
    if (!record) throw new Error('未找到报告。');
    // Never play a replacement file against old timestamps.
    let available = false;
    try { available = await withDirectoryAccess(record.path, async () => (await fingerprint(await checkedPath(record.path))) === record.hash); } catch { /* missing or no longer authorized */ }
    return { ...record, missing: !available };
  });
  handle('relink', async ({ id }) => {
    const record = records().find(item => item.id === id);
    if (!record) throw new Error('报告不存在。');
    const result = await dialog.showOpenDialog({ title: '选择原视频以恢复关联', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm'] }], securityScopedBookmarks: process.mas });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const access = { path: filePath, bookmark: result.bookmarks?.[0] || '' };
    const stop = process.mas && access.bookmark ? app.startAccessingSecurityScopedResource(access.bookmark) : () => {};
    try {
      if (await fingerprint(filePath) !== record.hash) throw new Error('文件内容与原视频不一致。剪辑或转码后的视频不能复用旧时间点。');
      database.set('access', [...database.get('access', []).filter(item => item.path !== filePath), access]);
      const updated = { ...record, path: filePath, name: path.basename(filePath) };
      writeRecord(updated);
      return updated;
    } finally { stop(); }
  });
  handle('cancel', () => { active?.abort(); });
  handle('analyze', async ({ filePath, duration }, event) => {
    if (active) throw new Error('已有视频正在分析，请等待或取消。');
    if (!Number.isFinite(duration) || duration <= 0 || duration > 900) throw new Error('首版支持最长 15 分钟的视频，请等待播放器加载时长。');
    const apiKey = key();
    const baseUrl = configuredBaseUrl();
    const controller = new AbortController();
    active = controller;
    const timeout = setTimeout(() => controller.abort(new DOMException('任务超时', 'TimeoutError')), 20 * 60000);
    const progress = message => { if (!event.sender.isDestroyed()) event.sender.send('ai:progress', message); };
    let remoteName;
    try {
      progress('正在校验视频身份…');
      const record = await resolve(filePath, controller.signal);
      const model = database.get('model', 'gemini-3.8-flash');
      return await withDirectoryAccess(record.path, async () => {
        const stats = await fs.promises.stat(record.path);
        if (stats.size > 2 * 1024 ** 3) throw new Error('首版支持最大 2 GB 的视频。');
        const report = await analyze({ apiKey, baseUrl, model, filePath: record.path, duration, signal: controller.signal, progress, remote: name => {
          remoteName = name;
          database.set('pendingCleanup', [...pendingCleanup().filter(item => item.name !== name || item.baseUrl !== baseUrl), { name, baseUrl }]);
        } });
        controller.signal.throwIfAborted();
        if (await fingerprint(record.path, controller.signal) !== record.hash) throw new Error('分析期间视频发生变化，报告未保存。');
        const version = { ...report, id: crypto.randomUUID(), createdAt: new Date().toISOString(), model, baseUrl, sourceHash: record.hash, duration, promptVersion: 1 };
        const current = records().find(item => item.id === record.id) || record;
        const updated = { ...current, reports: [...current.reports, version] };
        writeRecord(updated);
        return updated;
      });
    } finally {
      if (remoteName) {
        progress('正在清理远端临时文件…');
        try {
          await removeRemote(apiKey, remoteName, baseUrl);
          database.set('pendingCleanup', pendingCleanup().filter(item => item.name !== remoteName || item.baseUrl !== baseUrl));
        } catch { progress('报告已处理；远端文件清理失败，请在设置中测试连接以重试清理。'); }
      }
      clearTimeout(timeout);
      active = null;
    }
  });
  handle('save', ({ id, reportId, notes }) => {
    const record = records().find(item => item.id === id);
    const report = record?.reports.find(item => item.id === reportId);
    if (!report || !Array.isArray(notes) || notes.length !== report.notes.length) throw new Error('笔记版本不存在。');
    if (notes.some(text => typeof text !== 'string' || text.length > 100000)) throw new Error('笔记内容过长。');
    report.originalNotes ||= structuredClone(report.notes);
    report.notes = report.notes.map((item, index) => ({ ...item, text: notes[index] }));
    report.editedAt = new Date().toISOString();
    writeRecord(record);
    return record;
  });
  handle('frame', ({ id, reportId, index, image }) => {
    const record = records().find(item => item.id === id);
    const report = record?.reports.find(item => item.id === reportId);
    if (!report || !Number.isInteger(index) || index < 0 || index >= Math.min(6, report.chapters.length) || typeof image !== 'string' || image.length > 150000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('无效的关键帧。');
    report.frames ||= {};
    report.frames[index] = image;
    writeRecord(record);
  });
  handle('export', async ({ id, reportId }) => {
    const record = records().find(item => item.id === id);
    const report = record?.reports.find(item => item.id === reportId);
    if (!report) throw new Error('报告不存在。');
    const result = await dialog.showSaveDialog({ defaultPath: '个人笔记.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (!result.canceled) await fs.promises.writeFile(result.filePath, markdown(report), 'utf8');
    return !result.canceled;
  });
}
