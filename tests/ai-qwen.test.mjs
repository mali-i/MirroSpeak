import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyze, checkConnection, request } from '../src/ai/qwen.mjs';
const baseUrl = 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const segment = { title: '内容', text: '我还不确定。', startSeconds: 0, endSeconds: 5 };
const report = { title: '笔记', summary: '摘要', chapters: [segment], materials: [], notes: [segment] };
function reply(text = JSON.stringify(report), finish = 'stop') {
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: finish }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { total_tokens: 100 } })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
}
test('Qwen SDK submits complete local video with text output and retains usage', async () => {
  const original = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-test-'));
  const filePath = path.join(dir, 'video.mp4');
  await fs.writeFile(filePath, 'video-and-audio');
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, baseUrl + '/chat/completions');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer test-key');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'qwen3.8-omni-flash');
    assert.deepEqual(body.modalities, ['text']);
    assert.equal(body.stream_options.include_usage, true);
    assert.equal(body.response_format.type, 'json_object');
    assert.equal(Buffer.from(body.messages[0].content[0].video_url.url.split(',')[1], 'base64').toString(), 'video-and-audio');
    assert.match(body.messages[0].content[1].text, /综合音频和画面/);
    return reply();
  };
  try {
    const result = await analyze({ apiKey: 'test-key', baseUrl, filePath, duration: 10 });
    assert.equal(result.title, '笔记'); assert.equal(result.usage.total_tokens, 100);
    assert.equal(result.speechSource, 'video-audio');
    assert.equal(result.transcriptionModel, null);
    assert.equal(result.inputMode, 'inline'); assert.equal(result.compressed, false);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; await fs.rm(dir, { recursive: true, force: true }); }
});
test('signed original-video URL bypasses local encoding and is not stored in result', async () => {
  const original = globalThis.fetch;
  const videoUrl = 'https://bucket.example/video.mp4?signature=secret';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.messages[0].content[0].video_url.url, videoUrl);
    return reply();
  };
  try {
    const result = await analyze({ apiKey: 'key', baseUrl, videoUrl, filePath: '/does-not-exist.mp4', duration: 10 });
    assert.equal(result.inputMode, 'url');
    assert(!JSON.stringify(result).includes('signature'));
  } finally { globalThis.fetch = original; }
});
test('invalid JSON caches response, truncated output is not considered recoverable', async () => {
  const original = globalThis.fetch;
  try {
    for (const [text, finish, canReparse] of [['{"notes": [', 'stop', true], [JSON.stringify(report), 'length', false]]) {
      globalThis.fetch = async () => reply(text, finish);
      let cached;
      await assert.rejects(analyze({ apiKey: 'key', baseUrl, videoUrl: 'https://bucket.example/video.mp4', duration: 10, onInvalidResponse: (response, metadata) => { cached = metadata; } }));
      assert.equal(cached.canReparse, canReparse);
    }
  } finally { globalThis.fetch = original; }
});
test('model directory is checked without generation', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { assert.equal(url, baseUrl + '/models'); assert.equal(init.method, 'GET'); return Response.json({ data: [{ id: 'qwen3.8-omni-flash' }] }); };
  try {
    assert.match(await checkConnection('key', baseUrl, 'qwen3.8-omni-flash'), /尚未验证/);
    await assert.rejects(checkConnection('key', baseUrl, 'qwen3.5-omni-plus'), /没有所选模型/);
  } finally { globalThis.fetch = original; }
});
test('HTTP failures do not retry, expose response secrets or follow redirects', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('private-key secret-response', { status: 429 }); };
  try {
    await assert.rejects(analyze({ apiKey: 'private-key', baseUrl, videoUrl: 'https://bucket.example/video.mp4', duration: 10 }), error => error.message.includes('额度') && !error.message.includes('private-key') && !error.message.includes('secret-response'));
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response(null, { status: 301, headers: { Location: 'https://other.example/?secret=key' } });
    await assert.rejects(request('key', baseUrl), error => error.code === 'REDIRECT_BLOCKED' && !error.message.includes('secret=key'));
  } finally { globalThis.fetch = original; }
});
test('cancellation is propagated into the SDK transport', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async (_url, init) => { init.signal.throwIfAborted(); assert.fail('must abort'); };
  try { await assert.rejects(analyze({ apiKey: 'key', baseUrl, videoUrl: 'https://bucket.example/video.mp4', duration: 10, signal: controller.signal })); }
  finally { globalThis.fetch = original; }
});

test('unknown models are rejected before any network or media processing', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('unsupported models must not send requests');
  try {
    await assert.rejects(analyze({ apiKey: 'key', baseUrl, model: 'unknown-omni', filePath: '/missing.mp4', duration: 10 }), /不在支持列表/);
  } finally { globalThis.fetch = original; }
});
