import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

// Exercise real IPC orchestration with isolated in-memory Electron/Store boundaries.
test('IPC lifecycle: private key, report versions, edits, relocation, and cleanup recovery', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'videolog-ipc-')));
  const oldFetch = globalThis.fetch;
  globalThis.__aiTest = { handlers: new Map(), values: {}, chosen: null, cleanupFails: false };
  const electron = `
    const state = globalThis.__aiTest;
    export const ipcMain = { handle: (name, fn) => state.handlers.set(name, fn) };
    export const app = {};
    export const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [state.chosen] }) };
    export const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from('encrypted:' + text), decryptString: bytes => bytes.toString().slice(10) };
  `;
  const store = `export default class Store {
    get(key, fallback) { return structuredClone(globalThis.__aiTest.values[key] ?? fallback); }
    set(key, value) { globalThis.__aiTest.values[key] = structuredClone(value); }
    delete(key) { delete globalThis.__aiTest.values[key]; }
  }`;
  try {
    await build({ entryPoints: ['src/ai/main.mjs'], outfile: path.join(dir, 'main.mjs'), bundle: true, platform: 'node', format: 'esm', plugins: [{ name: 'electron-test-boundary', setup(b) {
      b.onResolve({ filter: /^(electron|electron-store)$/ }, args => ({ path: args.path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'electron' ? electron : store }));
    } }] });
    const { registerAI, movedVideo } = await import(path.join(dir, 'main.mjs'));
    registerAI({ withDirectoryAccess: async (_path, fn) => fn(), getDirectoryAccessForPath: target => target.startsWith(dir) ? { path: dir } : null });
    const invoke = async (action, data) => globalThis.__aiTest.handlers.get(`ai:${action}`)({ sender: { isDestroyed: () => false, send() {} } }, data);
    assert.equal((await invoke('settings')).data.hasKey, false);
    assert.equal((await invoke('configure', { apiKey: 'private-key', model: 'gemini-test' })).success, true);
    assert.equal(JSON.stringify((await invoke('settings')).data).includes('private-key'), false);
    assert.equal(globalThis.__aiTest.values.encryptedKey.includes('private-key'), false);
    const filePath = path.join(dir, 'original.mp4');
    await fs.writeFile(filePath, 'video');
    const original = (await invoke('open', { filePath })).data;
    const part = { title: '原意', text: '我的计划还没确定。', startSeconds: 0, endSeconds: 5 };
    globalThis.__aiTest.urls = [];
    globalThis.fetch = async (url, options) => {
      globalThis.__aiTest.urls.push(url);
      if (url.includes('/upload/')) return new Response('{}', { headers: { 'x-goog-upload-url': url.replace('/upload/v1beta/files', '/session') } });
      if (url.endsWith('/session')) { for await (const _chunk of options.body) {} return Response.json({ file: { name: 'files/test', uri: 'https://generativelanguage.googleapis.com/v1beta/files/test', state: 'ACTIVE' } }); }
      if (options.method === 'DELETE') return new Response(null, { status: globalThis.__aiTest.cleanupFails ? 500 : 200 });
      if (options.method !== 'POST') return Response.json({ name: 'models/gemini-test' });
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ title: '笔记', summary: '摘要', chapters: [part], materials: [part], notes: [part] }) }] } }] });
    };
    const analyzed = await invoke('analyze', { filePath, duration: 10 });
    assert.equal(analyzed.success, true, analyzed.error);
    const first = analyzed.data.reports[0];
    assert.equal(globalThis.__aiTest.values.pendingCleanup.length, 0);
    await invoke('save', { id: original.id, reportId: first.id, notes: ['用户修改过的内容'] });
    const moved = path.join(dir, 'renamed.mp4'); await fs.rename(filePath, moved); movedVideo(filePath, moved);
    globalThis.__aiTest.cleanupFails = true;
    const second = await invoke('analyze', { filePath: moved, duration: 10 });
    assert.equal(second.success, true, second.error);
    assert.equal(second.data.id, original.id);
    assert.equal(second.data.reports.length, 2);
    assert.equal(second.data.reports[0].notes[0].text, '用户修改过的内容');
    assert.equal(second.data.reports[0].originalNotes[0].text, part.text);
    assert.equal(globalThis.__aiTest.values.pendingCleanup.length, 1);
    globalThis.__aiTest.cleanupFails = false;
    await invoke('test');
    assert.equal(globalThis.__aiTest.values.pendingCleanup.length, 0);
    const relocated = path.join(dir, 'relocated.mp4'); await fs.rename(moved, relocated);
    assert.equal((await invoke('open', { id: original.id })).data.missing, true);
    const other = path.join(dir, 'different.mp4'); await fs.writeFile(other, 'other');
    globalThis.__aiTest.chosen = other;
    assert.equal((await invoke('relink', { id: original.id })).success, false);
    globalThis.__aiTest.chosen = relocated;
    assert.equal((await invoke('relink', { id: original.id })).data.id, original.id);
    assert.equal((await invoke('open', { id: original.id })).data.missing, false);
    // Historical official files must not be cleaned with the new relay's key.
    globalThis.__aiTest.values.pendingCleanup = ['files/legacy'];
    assert.equal((await invoke('configure', { model: 'gemini-test', baseUrl: 'https://relay.example/gemini' })).success, false);
    const configured = await invoke('configure', { model: 'gemini-test', baseUrl: 'https://relay.example/gemini/v1beta/', apiKey: 'relay-key' });
    assert.equal(configured.data.baseUrl, 'https://relay.example/gemini');
    globalThis.__aiTest.urls = [];
    assert.equal((await invoke('test')).success, true);
    const proxied = await invoke('analyze', { filePath: relocated, duration: 10 });
    assert.equal(proxied.success, true, proxied.error);
    assert.equal(proxied.data.reports.at(-1).baseUrl, 'https://relay.example/gemini');
    assert(globalThis.__aiTest.urls.every(url => url.startsWith('https://relay.example/gemini/')));
    assert(globalThis.__aiTest.urls.some(url => url.includes('/upload/v1beta/files')));
    assert(globalThis.__aiTest.urls.some(url => url.includes(':generateContent')));
    assert.equal(globalThis.__aiTest.values.pendingCleanup.length, 1);
    assert.equal(globalThis.__aiTest.values.pendingCleanup[0].baseUrl, 'https://generativelanguage.googleapis.com');
    await fs.writeFile(relocated, 'changed');
    assert.equal((await invoke('open', { id: original.id })).data.missing, true);
    assert.equal((await invoke('analyze', { filePath: relocated, duration: 901 })).success, false);
  } finally { globalThis.fetch = oldFetch; delete globalThis.__aiTest; await fs.rm(dir, { recursive: true, force: true }); }
});
