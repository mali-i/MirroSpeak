import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createElectronFetch, networkError } from '../src/ai/network.mjs';

test('Chromium transport preserves authentication, cancellation and streaming upload bytes', async () => {
  const controller = new AbortController();
  const transport = createElectronFetch(async (endpoint, init) => {
    assert.equal(endpoint, 'https://relay.example/upload');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.signal, controller.signal);
    assert.equal(init.headers.get('authorization'), 'Bearer test');
    assert.equal(init.headers.has('content-length'), false);
    assert.equal(init.duplex, 'half');
    assert.equal(typeof init.body.getReader, 'function');
    const data = await new Response(init.body).text();
    assert.equal(data, 'video-bytes');
    return new Response('{}');
  });
  await transport('https://relay.example/upload', { headers: { Authorization: 'Bearer test', 'Content-Length': '11' }, body: Readable.from([Buffer.from('video-bytes')]), signal: controller.signal, redirect: 'error' });
});
test('network diagnostics distinguish failures and never expose credentials or raw cause text', () => {
  for (const [code, hint] of [['ECONNRESET', '重置'], ['ENOTFOUND', '解析'], ['ERR_PROXY_CONNECTION_FAILED', '代理'], ['CERT_HAS_EXPIRED', '证书'], ['ETIMEDOUT', '超时']]) {
    const error = new TypeError(`fetch failed ${code.startsWith('ERR_') ? code : ''}`, { cause: { code, message: 'secret-key' } });
    const result = networkError(error, 'https://relay.example/api?key=private');
    assert.match(result.message, new RegExp(hint));
    assert.match(result.message, /relay.example/);
    assert(!result.message.includes('private') && !result.message.includes('secret-key'));
  }
  const aborted = new DOMException('cancelled', 'AbortError');
  assert.equal(networkError(aborted, 'https://relay.example'), aborted);
});
