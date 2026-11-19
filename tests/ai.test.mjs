import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fingerprint, identify, validateReport, markdown } from '../src/ai/core.mjs';
import { analyze, request, removeRemote } from '../src/ai/gemini.mjs';

const segment = { title: '计划', text: '我还没有确定下一步。', startSeconds: 1, endSeconds: 9 };
const raw = { title: '个人笔记', summary: '保留不确定性', chapters: [segment], materials: [segment], notes: [segment] };
test('renaming and moving preserve identity; changed bytes create a new identity', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'videolog-test-'));
  try {
    const first = path.join(dir, 'original.mp4'), moved = path.join(dir, 'renamed.mp4');
    await fs.writeFile(first, 'original-video');
    const original = identify([], await fingerprint(first), first);
    original.reports.push({ id: 'saved-report' });
    await fs.rename(first, moved);
    const same = identify([original], await fingerprint(moved), moved);
    assert.equal(same.id, original.id);
    assert.equal(same.reports[0].id, 'saved-report');
    await fs.writeFile(moved, 'modified-video');
    assert.notEqual(identify([original], await fingerprint(moved), moved).id, original.id);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('report validation converts to milliseconds and rejects invented timestamps', () => {
  assert.equal(validateReport(raw, 10).notes[0].startMs, 1000);
  for (const startSeconds of [-1, NaN, '1', 11]) assert.throws(() => validateReport({ ...raw, notes: [{ ...segment, startSeconds }] }, 10));
  assert.throws(() => validateReport({ ...raw, chapters: [{ ...segment, endSeconds: 20 }] }, 10));
  assert.throws(() => validateReport({ ...raw, notes: [] }, 10));
  assert.throws(() => validateReport({ ...raw, summary: {} }, 10));
});
test('Markdown preserves edited notes and source times', () => {
  const report = validateReport(raw, 10);
  report.notes[0].text = '这是我编辑后的笔记。';
  const output = markdown(report);
  assert.match(output, /这是我编辑后的笔记/);
  assert.match(output, /0:01–0:09/);
});
test('Gemini file upload, structured generation and explicit deletion', async () => {
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'videolog-api-'));
  const filePath = path.join(dir, 'sample.mp4');
  await fs.writeFile(filePath, 'sample');
  const calls = [], progress = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers['x-goog-api-key'], 'test-key');
    if (url.includes('/upload/')) return new Response('{}', { headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload-session' } });
    if (url.endsWith('upload-session')) {
      for await (const chunk of options.body) assert.equal(chunk.toString(), 'sample');
      return Response.json({ file: { name: 'files/test', uri: 'https://generativelanguage.googleapis.com/v1beta/files/test', state: 'ACTIVE' } });
    }
    if (options.method === 'DELETE') return new Response(null, { status: 200 });
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.match(body.contents[0].parts[1].text, /不补充事实/);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(raw) }] } }], usageMetadata: { totalTokenCount: 100 } });
  };
  try {
    let name;
    const report = await analyze({ apiKey: 'test-key', model: 'gemini-test', filePath, duration: 10, signal: new AbortController().signal, progress: message => progress.push(message), remote: value => { name = value; } });
    assert.equal(name, 'files/test');
    assert.equal(report.notes[0].endMs, 9000);
    assert.equal(report.usage.totalTokenCount, 100);
    await removeRemote('test-key', name);
    assert.equal(calls.length, 4);
    assert(progress.some(event => event.stage === 'upload'));
    assert(progress.some(event => event.stage === 'analyze'));
    assert(progress.every(event => typeof event.message === 'string'));
  } finally { globalThis.fetch = originalFetch; await fs.rm(dir, { recursive: true, force: true }); }
});
test('API errors are actionable and do not expose response contents or key', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('secret-api-response', { status: 429 });
  try { await assert.rejects(request('private-key', 'https://example.com'), error => error.message.includes('额度') && !error.message.includes('secret') && !error.message.includes('private-key')); }
  finally { globalThis.fetch = originalFetch; }
});
test('cancelled requests are passed an abort signal', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async (_url, options) => { options.signal.throwIfAborted(); };
  try { await assert.rejects(request('key', 'https://example.com', { signal: controller.signal }), { name: 'AbortError' }); }
  finally { globalThis.fetch = originalFetch; }
});
