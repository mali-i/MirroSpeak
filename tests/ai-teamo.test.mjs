import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConnection, request } from '../src/ai/gemini.mjs';
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
