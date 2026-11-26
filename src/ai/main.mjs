import { readingChunks } from '../tts/text.mjs';
import { synthesize } from '../tts/service.mjs';
import { isSecureStorageAvailable } from './storage-security.mjs';
import { app, ipcMain, dialog, safeStorage, shell } from 'electron';
import Store from 'electron-store';
import { validateAnnotation, externalUrl } from './annotations.mjs';
import { getModelProfile } from './models.mjs';
import { createAnalysisPlan } from './progress.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fingerprint, identify, markdown } from './core.mjs';
import { parseReportResponse } from './report-response.mjs';
import { analyze, checkConnection, setRequestTransport } from './qwen.mjs';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, normalizeBaseUrl } from './endpoint.mjs';

// Separate from generic renderer-accessible configuration.
const database = new Store({ name: 'video-notes' });
const records = () => database.get('videos', []);
const writeRecord = record => database.set('videos', [...records().filter(item => item.id !== record.id), record]);
export function linkedAccess(targetPath) {
  return database.get('access', []).find(item => path.resolve(item.path) === path.resolve(targetPath)) || null;
}
const key = () => {
  const value = database.get('encryptedKey');
  if (database.get('provider') !== 'qwen-omni' || !value || !isSecureStorageAvailable(safeStorage)) throw new Error('请先在设置中保存 API Key。');
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
};
const configuredBaseUrl = () => database.get('provider') === 'qwen-omni' ? database.get('baseUrl', DEFAULT_BASE_URL) : DEFAULT_BASE_URL;
const publicSettings = () => ({ provider: 'qwen-omni', baseUrl: configuredBaseUrl(), model: database.get('provider') === 'qwen-omni' ? database.get('model', DEFAULT_MODEL) : DEFAULT_MODEL, hasKey: database.get('provider') === 'qwen-omni' && !!database.get('encryptedKey'), secureStorage: isSecureStorageAvailable(safeStorage) });
export function movedVideo(sourcePath, targetPath) {
  for (const record of records()) {
    if (record.path === sourcePath) writeRecord({ ...record, path: targetPath, name: path.basename(targetPath) });
  }
}
let active = null;
const speechTasks = new Map();

export function registerAI({ withDirectoryAccess, getDirectoryAccessForPath, fetch: fetchImpl }) {
  if (fetchImpl) setRequestTransport(fetchImpl);
  const handle = (name, fn) => ipcMain.handle(`ai:${name}`, async (event, data) => {
    try { return { success: true, data: await fn(data, event) }; }
    catch (error) { return { success: false, recoverable: error.code === 'REPORT_RESPONSE_INVALID' && error.recoverable !== false, error: error.name === 'AbortError' ? '任务已取消。' : error.name === 'TimeoutError' ? '任务超时，请手动重试。' : error.message }; }
  });
  const checkedPath = async target => {
    if (typeof target !== 'string' || !/\.(mp4|webm)$/i.test(target)) throw new Error('请选择 MP4 或 WebM 视频。');
    const resolved = await fs.promises.realpath(target);
    if (!getDirectoryAccessForPath(resolved) && !linkedAccess(resolved)) throw new Error('请在视频库中选择视频或使用“重新定位”授权文件。');
    return resolved;
  };
  const resolve = async (target, signal, onProgress) => {
    return withDirectoryAccess(target, async () => {
      const filePath = await checkedPath(target);
      const hash = await fingerprint(filePath, signal, onProgress);
      const record = identify(records(), hash, filePath);
      record.name = path.basename(filePath);
      writeRecord(record);
      return record;
    });
  };
  handle('tts-cancel', ({ requestId }, event) => {
    const task = speechTasks.get(event.sender);
    if (task?.requestId === requestId) task.controller.abort();
  });
  handle('tts', async ({ id, reportId, topic = null, index, requestId }, event) => {
    if (typeof requestId !== 'string' || requestId.length > 100 || !requestId) throw new Error('朗读任务无效。');
    if (speechTasks.has(event.sender)) throw new Error('请等待上一段朗读任务停止后重试。');
    const report = records().find(item => item.id === id)?.reports.find(item => item.id === reportId);
    if (!report || report.schemaVersion !== 2) throw new Error('笔记版本不存在。');
    const chunks = readingChunks(report, topic);
    if (!Number.isInteger(index) || !chunks[index]) throw new Error('朗读段落不存在。');
    const apiKey = key(), baseUrl = configuredBaseUrl();
    const controller = new AbortController();
    speechTasks.set(event.sender, { requestId, controller });
    const destroyed = () => controller.abort();
    event.sender.once?.('destroyed', destroyed);
    const timer = setTimeout(() => controller.abort(new DOMException('朗读超时', 'TimeoutError')), 90000);
    try {
      return await synthesize({ text: chunks[index].text, apiKey, baseUrl,
        cacheDir: path.join(app.getPath('userData'), 'tts-cache'), signal: controller.signal,
        fetchAudio: fetchImpl || ((...args) => globalThis.fetch(...args)) });
    } finally {
      clearTimeout(timer);
      event.sender.removeListener?.('destroyed', destroyed);
      speechTasks.delete(event.sender);
    }
  });
  handle('settings', () => publicSettings());
  handle('configure', ({ apiKey, model, baseUrl = DEFAULT_BASE_URL }) => {
    if (active || speechTasks.size) throw new Error('请等待当前任务结束后再修改配置。');
    getModelProfile(model);
    if (apiKey !== undefined && typeof apiKey !== 'string') throw new Error('API Key 格式无效。');
    apiKey = apiKey?.trim();
    const normalizedBase = normalizeBaseUrl(baseUrl);
    if ((database.get('provider') !== 'qwen-omni' || normalizedBase !== configuredBaseUrl()) && !apiKey?.trim()) throw new Error('更换 Base URL 时请重新填写对应的 API Key。');
    if (apiKey) {
      if (!isSecureStorageAvailable(safeStorage)) throw new Error('系统安全存储不可用，无法保存 Key。');
      if (typeof apiKey !== 'string' || apiKey.length > 500) throw new Error('API Key 格式无效。');
      database.set('encryptedKey', safeStorage.encryptString(apiKey.trim()).toString('base64'));
    }
    database.set('provider', 'qwen-omni');
    database.delete('inputMode');
    database.set('baseUrl', normalizedBase);
    database.set('model', model.trim());
    return publicSettings();
  });
  handle('forget-key', () => {
    if (active || speechTasks.size) throw new Error('请先取消当前任务。');
    database.delete('encryptedKey');
  });
  handle('test', async () => {
    const apiKey = key();
    const model = database.get('model', DEFAULT_MODEL);
    const baseUrl = configuredBaseUrl();
    const message = await checkConnection(apiKey, baseUrl, model);
    return { message: `基础连接测试通过。${message}` };
  });
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
  handle('analyze', async ({ filePath, duration, videoUrl }, event) => {
    if (active) throw new Error('已有视频正在分析，请等待或取消。');
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('视频时长无效，请等待播放器加载时长。');
    const apiKey = key();
    const baseUrl = configuredBaseUrl();
    const model = database.get('model', DEFAULT_MODEL);
    const plan = createAnalysisPlan(model, videoUrl);
    const controller = new AbortController();
    active = controller;
    const timeout = setTimeout(() => controller.abort(new DOMException('任务超时', 'TimeoutError')), 20 * 60000);
    const taskId = crypto.randomUUID(), startedAt = Date.now();
    let currentStage = 'validate', failedStage, failure;
    const progress = update => {
      const value = typeof update === 'string' ? { message: update } : update;
      currentStage = value.stage || currentStage;
      if (!event.sender.isDestroyed()) event.sender.send('ai:progress', { taskId, startedAt, plan, status: 'running', ...value, stage: value.stage || currentStage });
    };
    try {
      progress({ stage: 'validate', message: '正在读取视频并校验内容身份…' });
      const record = await resolve(filePath, controller.signal, info => progress({ stage: 'validate', message: '正在校验视频身份…', ...info, unit: 'bytes' }));
      return await withDirectoryAccess(record.path, async () => {
        const stats = await fs.promises.stat(record.path);
        if (stats.size > 2 * 1024 ** 3) throw new Error('首版支持最大 2 GB 的视频。');
        const report = await analyze({ apiKey, baseUrl, videoUrl, model, filePath: record.path, duration, signal: controller.signal, progress, onInvalidResponse: (response, inputMetadata) => {
          const current = records().find(item => item.id === record.id) || record;
          writeRecord({ ...current, pendingAnalysis: { response, ...inputMetadata, duration, model, baseUrl, sourceHash: record.hash, createdAt: new Date().toISOString() } });
        } });
        controller.signal.throwIfAborted();
        progress({ stage: 'save', message: '正在复核原视频并保存笔记…' });
        if (await fingerprint(record.path, controller.signal) !== record.hash) throw new Error('分析期间视频发生变化，报告未保存。');
        const version = { ...report, id: crypto.randomUUID(), createdAt: new Date().toISOString(), model, baseUrl, sourceHash: record.hash, duration, promptVersion: 4 };
        const current = records().find(item => item.id === record.id) || record;
        const updated = { ...current, reports: [...current.reports, version] };
        delete updated.pendingAnalysis;
        writeRecord(updated);
        return updated;
      });
    } catch (error) {
      failure = error; failedStage = currentStage; throw error;
    } finally {
      clearTimeout(timeout);
      active = null;
      progress({ stage: failure ? failedStage : 'complete', status: failure ? (failure.name === 'AbortError' ? 'cancelled' : 'failed') : 'complete', message: failure ? (failure.name === 'AbortError' ? '任务已取消。' : '处理未完成，请查看下方错误。') : '个人笔记已保存。', finishedAt: Date.now() });
    }
  });
  handle('recover', ({ id }) => {
    if (active) throw new Error('请等待当前分析任务结束。');
    const record = records().find(item => item.id === id);
    const pending = record?.pendingAnalysis;
    if (!pending || pending.sourceHash !== record.hash) throw new Error('没有可以重新解析的本地响应。');
    const report = parseReportResponse(pending.response, pending.duration);
    const { response, ...metadata } = pending;
    record.reports.push({ ...report, ...metadata, id: crypto.randomUUID(), usage: response.usage || null, promptVersion: 4 });
    delete record.pendingAnalysis;
    writeRecord(record);
    return record;
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
  handle('annotation-save', ({ id, annotation }) => {
    const record = records().find(item => item.id === id);
    if (!record) throw new Error('视频记录不存在。');
    const clean = validateAnnotation(annotation);
    const annotations = record.annotations || [];
    const existing = annotation.id && annotations.find(item => item.id === annotation.id);
    const now = new Date().toISOString();
    const saved = { ...clean, id: existing?.id || crypto.randomUUID(), createdAt: existing?.createdAt || now, updatedAt: now };
    record.annotations = [...annotations.filter(item => item.id !== saved.id), saved];
    writeRecord(record);
    return record.annotations;
  });
  handle('annotation-delete', ({ id, annotationId }) => {
    const record = records().find(item => item.id === id);
    if (!record) throw new Error('视频记录不存在。');
    record.annotations = (record.annotations || []).filter(item => item.id !== annotationId);
    writeRecord(record);
    return record.annotations;
  });
  handle('annotation-link', async ({ url }) => { await shell.openExternal(externalUrl(url)); });
  handle('frame', ({ id, reportId, index, image }) => {
    const record = records().find(item => item.id === id);
    const report = record?.reports.find(item => item.id === reportId);
    if (!report || !Number.isInteger(index) || index < 0 || index >= Math.min(6, report.notes.length) || typeof image !== 'string' || image.length > 150000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('无效的关键帧。');
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
