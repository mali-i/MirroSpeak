const sse = value => new Response(`data: ${JSON.stringify(value)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

// Exercise real IPC orchestration with isolated in-memory Electron/Store boundaries.
test('IPC lifecycle: private key, report versions, edits, relocation, and provider configuration', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'videolog-ipc-')));
  const oldFetch = globalThis.fetch;
  globalThis.__aiTest = { handlers: new Map(), values: {}, chosen: null };
  const electron = `
    const state = globalThis.__aiTest;
    export const ipcMain = { handle: (name, fn) => state.handlers.set(name, fn) };
    export const app = {};
    export const shell = { openExternal: async url => { state.openedUrl = url; } };
    export const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [state.chosen] }) };
    export const safeStorage = { isEncryptionAvailable: () => state.storageAvailable !== false, getSelectedStorageBackend: () => 'gnome_libsecret', encryptString: text => Buffer.from('encrypted:' + text), decryptString: bytes => bytes.toString().slice(10) };
  `;
  const store = `export default class Store {
    get(key, fallback) { return structuredClone(globalThis.__aiTest.values[key] ?? fallback); }
    set(key, value) { globalThis.__aiTest.values[key] = structuredClone(value); }
    delete(key) { delete globalThis.__aiTest.values[key]; }
  }`;
  try {
    await build({ entryPoints: ['src/ai/main.mjs'], outfile: path.join(dir, 'main.mjs'), bundle: true, platform: 'node', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, plugins: [{ name: 'electron-test-boundary', setup(b) {
      b.onResolve({ filter: /^(electron|electron-store)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'electron' ? electron : store }));
    } }] });
    const { registerAI, movedVideo } = await import(path.join(dir, 'main.mjs'));
    registerAI({ withDirectoryAccess: async (_path, fn) => fn(), getDirectoryAccessForPath: target => target.startsWith(dir) ? { path: dir } : null });
    const events = [];
    const invoke = async (action, data) => globalThis.__aiTest.handlers.get(`ai:${action}`)({ sender: { isDestroyed: () => false, send(_channel, event) { events.push(event); } } }, data);
    globalThis.__aiTest.values.encryptedKey = Buffer.from('encrypted:old-provider-key').toString('base64');
    globalThis.__aiTest.values.baseUrl = 'https://old-provider.example';
    assert.equal((await invoke('settings')).data.hasKey, false);
    assert.equal((await invoke('settings')).data.baseUrl, '');
    assert.equal((await invoke('test')).success, false);
    assert.equal((await invoke('configure', { apiKey: 'private-key', model: 'qwen3.8-omni-flash', baseUrl: 'https://workspace.example/compatible-mode/v1' })).success, true);
    assert.equal(JSON.stringify((await invoke('settings')).data).includes('private-key'), false);
    assert.equal(globalThis.__aiTest.values.encryptedKey.includes('private-key'), false);
    assert.equal((await invoke('configure', { model: 'unknown-omni', baseUrl: 'https://workspace.example/compatible-mode/v1' })).success, false);
    assert.equal((await invoke('settings')).data.model, 'qwen3.8-omni-flash');
    const encryptedKeyBeforeFailure = globalThis.__aiTest.values.encryptedKey;
    globalThis.__aiTest.storageAvailable = false;
    assert.equal((await invoke('settings')).data.secureStorage, false);
    assert.equal((await invoke('configure', { apiKey: 'replacement-key', model: 'qwen3.8-omni-flash', baseUrl: 'https://workspace.example/compatible-mode/v1' })).success, false);
    assert.equal(globalThis.__aiTest.values.encryptedKey, encryptedKeyBeforeFailure);
    assert.equal((await invoke('test')).success, false);
    globalThis.__aiTest.storageAvailable = true;
    const filePath = path.join(dir, 'original.mp4');
    await fs.writeFile(filePath, 'video');
    const original = (await invoke('open', { filePath })).data;
    const created = await invoke('annotation-save', { id: original.id, annotation: { timeMs: 2000, text: '出处来自微博', links: [{ url: 'https://weibo.com/example', title: '原微博' }] } });
    assert.equal(created.success, true, created.error);
    const annotation = created.data[0];
    assert.equal((await invoke('annotation-link', { url: 'javascript:alert(1)' })).success, false);
    assert.equal((await invoke('annotation-link', { url: annotation.links[0].url })).success, true);
    assert.equal(globalThis.__aiTest.openedUrl, annotation.links[0].url);
    assert.equal(original.reports.length, 0);
    assert.deepEqual((await invoke('open', { filePath })).data.annotations, [annotation]);
    const editedAnnotation = await invoke('annotation-save', { id: original.id, annotation: { ...annotation, text: '已核对：出处来自微博' } });
    assert.equal(editedAnnotation.data[0].id, annotation.id);
    assert.equal(editedAnnotation.data[0].createdAt, annotation.createdAt);
    Object.assign(annotation, editedAnnotation.data[0]);
    const part = { title: '原意', text: '我的计划还没确定。', takeaway: '核心意思', type: '观点', sources: [{ startSeconds: 0, endSeconds: 5 }] };
    globalThis.__aiTest.urls = [];
    globalThis.fetch = async (url, options) => {
      globalThis.__aiTest.urls.push(url);
      if (options.method !== 'POST') return Response.json({ data: [{ id: 'qwen3.8-omni-flash' }] });
      return sse({ choices: [{ index: 0, finish_reason: 'stop', delta: { content: JSON.stringify({ title: '笔记', summary: '摘要', schemaVersion: 2, uncertainties: [], materials: [part], notes: [part] }) } }] });
    };
    const analyzed = await invoke('analyze', { filePath, duration: 10 });
    assert.equal(analyzed.success, true, analyzed.error);
    assert.equal(events.at(-1).status, 'complete');
    assert(events.some(event => event.stage === 'save'));
    assert(events.every(event => event.plan.model === 'qwen3.8-omni-flash'));
    assert(events.every(event => !event.plan.steps.some(step => step.id === 'transcribe')));
    assert(events.at(-1).finishedAt >= events[0].startedAt);
    const first = analyzed.data.reports[0];
    await invoke('save', { id: original.id, reportId: first.id, notes: ['用户修改过的内容'] });
    const moved = path.join(dir, 'renamed.mp4'); await fs.rename(filePath, moved); movedVideo(filePath, moved);
    const second = await invoke('analyze', { filePath: moved, duration: 10 });
    assert.equal(second.success, true, second.error);
    assert.equal(events.at(-1).status, 'complete');
    assert.equal(second.data.id, original.id);
    assert.equal(second.data.reports.length, 2);
    assert.deepEqual(second.data.annotations, [annotation]);
    assert.equal(second.data.reports[0].notes[0].text, '用户修改过的内容');
    assert.equal(second.data.reports[0].originalNotes[0].text, part.text);
    await invoke('test');
    const relocated = path.join(dir, 'relocated.mp4'); await fs.rename(moved, relocated);
    assert.equal((await invoke('open', { id: original.id })).data.missing, true);
    const other = path.join(dir, 'different.mp4'); await fs.writeFile(other, 'other');
    globalThis.__aiTest.chosen = other;
    assert.equal((await invoke('relink', { id: original.id })).success, false);
    globalThis.__aiTest.chosen = relocated;
    assert.equal((await invoke('relink', { id: original.id })).data.id, original.id);
    assert.equal((await invoke('open', { id: original.id })).data.missing, false);
    assert.equal((await invoke('configure', { model: 'qwen3.8-omni-flash', baseUrl: 'https://new.example/compatible-mode/v1' })).success, false);
    const configured = await invoke('configure', { model: 'qwen3.8-omni-flash', baseUrl: 'https://new.example/compatible-mode/v1/', apiKey: 'new-key' });
    assert.equal(configured.data.baseUrl, 'https://new.example/compatible-mode/v1');
    globalThis.__aiTest.urls = [];
    assert.equal((await invoke('test')).success, true);
    const proxied = await invoke('analyze', { filePath: relocated, duration: 10 });
    assert.equal(proxied.success, true, proxied.error);
    assert(globalThis.__aiTest.urls.every(url => url.startsWith('https://new.example/compatible-mode/v1/')));
    const stored = globalThis.__aiTest.values.videos.find(item => item.id === original.id);
    const json = JSON.stringify({ title: '恢复笔记', summary: '摘要', schemaVersion: 2, uncertainties: [], materials: [], notes: [part] });
    stored.pendingAnalysis = { response: { choices: [{ finish_reason: 'stop', message: { content: '```json\n' + json + '\n```' } }] }, duration: 10, model: 'qwen3.8-omni-flash', sourceHash: stored.hash, createdAt: new Date().toISOString() };
    const callsBeforeRecovery = globalThis.__aiTest.urls.length;
    const recovered = await invoke('recover', { id: original.id });
    assert.equal(recovered.success, true, recovered.error);
    assert.equal(recovered.data.reports.at(-1).title, '恢复笔记');
    assert.equal(recovered.data.pendingAnalysis, undefined);
    assert.equal(globalThis.__aiTest.urls.length, callsBeforeRecovery);
    assert.equal((await invoke('annotation-delete', { id: original.id, annotationId: annotation.id })).data.length, 0);
    await fs.writeFile(relocated, 'changed');
    assert.equal((await invoke('open', { id: original.id })).data.missing, true);
    assert.equal((await invoke('analyze', { filePath: relocated, duration: 901 })).success, false);
  } finally { globalThis.fetch = oldFetch; delete globalThis.__aiTest; await fs.rm(dir, { recursive: true, force: true }); }
});
