import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyze, checkConnection, request } from '../src/ai/gemini.mjs';
import { normalizeBaseUrl } from '../src/ai/endpoint.mjs';

test('TeamoRouter uses the documented Bearer header and model catalog endpoint', async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.headers['x-goog-api-key'], undefined);
    assert.equal(options.redirect, 'error');
    return Response.json({ data: [{ id: 'gemini-test' }] });
  };
  try {
    assert.equal(normalizeBaseUrl('https://api.teamorouter.com/v1'), 'https://api.teamorouter.com');
    assert.match(await checkConnection('test-key', 'https://api.teamorouter.com', 'gemini-test'), /尚未验证/);
    assert.deepEqual(calls, ['https://api.teamorouter.com/v1/models']);
    await request('test-key', 'https://api.teamorouter.com/v1beta/models/gemini-test:generateContent', { method: 'POST' });
  } finally { globalThis.fetch = oldFetch; }
});
test('connection check rejects a missing model and HTML masquerading as success', async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ data: [{ id: 'other-model' }] });
    await assert.rejects(checkConnection('key', 'https://api.teamorouter.com', 'gemini-test'), /没有所填模型/);
    globalThis.fetch = async () => new Response('<html>login</html>');
    await assert.rejects(checkConnection('key', 'https://api.teamorouter.com', 'gemini-test'), /不是 JSON/);
    await assert.rejects(checkConnection('key', 'https://relay.example', 'gemini-test'), /未返回 JSON/);
  } finally { globalThis.fetch = oldFetch; }
});

test('upload initialization failures distinguish redirects and unsupported Files without sending video', async () => {
  const oldFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'videolog-upload-test-'));
  const filePath = path.join(dir, 'video.mp4');
  await fs.writeFile(filePath, 'test');
  try {
    for (const scenario of ['redirect', 'unsupported']) {
      let count = 0;
      globalThis.fetch = async (_url, init) => {
        count++;
        assert.equal(typeof init.body, 'string'); // metadata only
        if (scenario === 'redirect') throw new Error('Redirect was cancelled');
        return new Response(null, { status: 404 });
      };
      await assert.rejects(analyze({ apiKey: 'test', baseUrl: 'https://api.teamorouter.com', model: 'gemini-test', filePath, duration: 10, inputMode: 'files', progress() {}, remote() {} }), scenario === 'redirect' ? /重定向.*尚未发送/ : /HTTP 404/);
      assert.equal(count, 1);
    }
  } finally { globalThis.fetch = oldFetch; await fs.rm(dir, { recursive: true, force: true }); }
});

test('HTTP redirects report the failing stage and hostname without exposing Location secrets', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 301, headers: { Location: 'https://other.example/upload?key=private-key' } });
  try {
    await assert.rejects(request('private-key', 'https://api.teamorouter.com/upload/v1beta/files', { stage: '视频上传初始化' }), error => error.code === 'REDIRECT_BLOCKED' && error.message.includes('HTTP 301') && error.message.includes('视频上传初始化') && error.message.includes('other.example') && !error.message.includes('private-key'));
  } finally { globalThis.fetch = oldFetch; }
});
