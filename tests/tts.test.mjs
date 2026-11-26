import test from 'node:test';
import { wavFixture } from './helpers/wav.mjs';
import { normalizeWav } from '../src/tts/wav.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readingChunks } from '../src/tts/text.mjs';
import { synthesize, ttsEndpoint, TTS_MODEL, normalizeAudioUrl } from '../src/tts/service.mjs';
import { setRequestTransport } from '../src/ai/qwen.mjs';
import { createReadingPlayer } from '../src/tts/playback.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const wav = wavFixture();

test('reading uses saved text, excludes source metadata and preserves Unicode across bounded chunks', () => {
  const report = { title: '笔记', summary: '概览', notes: [{ title: '主题', takeaway: '核心', text: '**已编辑**[链接](https://example.com)\n' + '😀'.repeat(600), sources: [{ startMs: 1000 }] }] };
  const chunks = readingChunks(report);
  assert(chunks.every(chunk => Array.from(chunk.text).length <= 240));
  assert(!chunks.some(chunk => /https|startMs|\*\*/.test(chunk.text)));
  assert(chunks.map(chunk => chunk.text).join('').includes('已编辑链接'));
  assert.equal(chunks.map(chunk => chunk.text).join('').match(/😀/gu).length, 600);
  assert(readingChunks(report, 0).every(chunk => chunk.topic === 0));
  assert.throws(() => readingChunks(report, -1));
});

test('TTS authenticates only synthesis, caches WAV and rejects failures without retrying', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirro-tts-'));
  let paidCalls = 0, downloads = 0;
  const baseUrl = 'https://workspace.example/compatible-mode/v1';
  assert.equal(ttsEndpoint(baseUrl), 'https://workspace.example/api/v1/services/audio/tts/SpeechSynthesizer');
  assert.throws(() => ttsEndpoint('https://example.com/wrong'));
  setRequestTransport(async (url, options) => {
    paidCalls++;
    assert.equal(url, ttsEndpoint(baseUrl));
    assert.equal(options.headers.Authorization, 'Bearer secret');
    assert.equal(JSON.parse(options.body).model, TTS_MODEL);
    return Response.json({ output: { audio: { url: 'https://audio.example/signed?token=private' } } });
  });
  const options = { text: '这是一段笔记。', apiKey: 'secret', baseUrl, cacheDir, signal: new AbortController().signal,
    fetchAudio: async (_url, init) => { downloads++; assert.equal(init.headers, undefined); assert.equal(init.redirect, 'error'); return new Response(wav); } };
  try {
    assert.equal((await synthesize(options)).cached, false);
    assert.equal((await synthesize(options)).cached, true);
    assert.equal(paidCalls, 1); assert.equal(downloads, 1);
    assert.equal((await synthesize({ ...options, text: '编辑后的笔记。' })).cached, false);
    setRequestTransport(async () => { paidCalls++; return new Response('secret raw provider error', { status: 403 }); });
    await assert.rejects(synthesize({ ...options, text: '无权限。' }), error => /403/.test(error.message) && !/secret/.test(error.message));
    assert.equal(paidCalls, 3);
    setRequestTransport(async () => Response.json({ output: { audio: { url: 'http://insecure.example/audio' } } }));
    await assert.rejects(synthesize({ ...options, text: '不安全地址。' }), /未使用 HTTPS/);
    setRequestTransport(async () => Response.json({ output: { audio: { url: 'https://audio.example/file' } } }));
    await assert.rejects(synthesize({ ...options, text: '损坏音频。', fetchAudio: async () => new Response('broken') }), /WAV/);
    assert.equal((await fs.readdir(cacheDir)).filter(name => name.endsWith('.tmp')).length, 0);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(synthesize({ ...options, signal: controller.signal }), { name: 'AbortError' });
  } finally { setRequestTransport((...args) => globalThis.fetch(...args)); await fs.rm(cacheDir, { recursive: true, force: true }); }
});

function playerHarness(request) {
  const states = [], audios = [], revoked = [], cancelled = [];
  const player = createReadingPlayer({ request, cancel: async id => cancelled.push(id), createUrl: () => 'blob:test', revokeUrl: url => revoked.push(url),
    createAudio: () => { const audio = { playbackRate: 1, play: async () => { audio.played = (audio.played || 0) + 1; }, pause() {}, removeAttribute() {}, load() {} }; audios.push(audio); return audio; }, update: state => states.push(state) });
  return { player, states, audios, revoked, cancelled };
}
test('stopping pending synthesis prevents late audio and subsequent paid paragraphs', async () => {
  let resolve, calls = 0;
  const h = playerHarness(() => { calls++; return new Promise(done => { resolve = done; }); });
  const running = h.player.start([{ topic: 0 }, { topic: 1 }], {});
  h.player.stop(); resolve({ audio: wav }); await running;
  assert.equal(calls, 1); assert.equal(h.audios.length, 0); assert.equal(h.cancelled.length, 1);
});
test('pause during synthesis waits to play; resume, rate, queue completion and stop release resources', async () => {
  let resolve;
  const h = playerHarness(() => new Promise(done => { resolve = done; }));
  const running = h.player.start([{ topic: 0 }], {});
  h.player.pause(); resolve({ audio: wav }); await tick();
  assert.equal(h.audios[0].played, undefined);
  h.player.setRate(1.5); await h.player.resume(); await tick();
  assert.equal(h.audios[0].played, 1); assert.equal(h.audios[0].playbackRate, 1.5);
  h.player.pause(); await h.player.resume(); assert.equal(h.audios[0].played, 2);
  h.audios[0].onended(); await running;
  assert.equal(h.states.at(-1).state, 'idle'); assert.equal(h.revoked.length, 1);
});
test('switching topics waits for cancelled request and ignores stale completion', async () => {
  let resolve; let calls = 0;
  const h = playerHarness(() => { calls++; if (calls === 1) return new Promise(done => { resolve = done; }); return Promise.resolve({ audio: wav }); });
  const first = h.player.start([{ topic: 0 }], {});
  const second = h.player.start([{ topic: 1 }], {});
  assert.equal(calls, 1);
  resolve({ audio: wav }); await tick();
  assert.equal(calls, 2); assert.equal(h.audios.length, 1);
  h.player.stop(); await Promise.all([first, second]);
  assert.equal(h.revoked.length, 1);
});
test('late resume completion cannot restore playing state after stop', async () => {
  const h = playerHarness(async () => ({ audio: wav }));
  const running = h.player.start([{ topic: 0 }], {}); await tick();
  h.player.pause();
  let resolvePlay;
  h.audios[0].play = () => new Promise(resolve => { resolvePlay = resolve; });
  const resuming = h.player.resume(); h.player.stop(); resolvePlay();
  await Promise.all([running, resuming]);
  assert.equal(h.states.at(-1).state, 'idle');
});

test('Bailian HTTP OSS audio URL upgrades to HTTPS preserving signed path and query', () => {
  const source = 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/pre/audio%20clip.wav?OSSAccessKeyId=example&Expires=123&Signature=a%2Bb%2Fc%3D';
  assert.equal(normalizeAudioUrl(source).href, source.replace('http:', 'https:'));
  assert.equal(normalizeAudioUrl('https://cdn.example/audio.wav?sig=a%2B').href, 'https://cdn.example/audio.wav?sig=a%2B');
  for (const invalid of ['http://untrusted.example/audio', 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.example/file', 'http://bucket.oss-cn-beijing.aliyuncs.com:8080/file', 'https://user:password@audio.example/file', 'file:///tmp/audio.wav', 'https://audio.example/file#fragment']) assert.throws(() => normalizeAudioUrl(invalid));
  assert.throws(() => normalizeAudioUrl(undefined), /未返回音频/);
});

test('synthesis downloads HTTP OSS result over HTTPS without forwarding credentials', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirro-tts-http-'));
  const source = 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/pre/test.wav?Signature=a%2Bb%3D&Expires=123';
  let paidCalls = 0;
  setRequestTransport(async () => { paidCalls++; return Response.json({ output: { audio: { url: source } } }); });
  try {
    const result = await synthesize({ text: '兼容百炼下载地址。', apiKey: 'secret', baseUrl: 'https://workspace.example/compatible-mode/v1', cacheDir,
      fetchAudio: async (url, init) => {
        assert.equal(url, source.replace('http:', 'https:'));
        assert.equal(init.headers, undefined);
        assert.equal(init.credentials, 'omit');
        assert.equal(init.redirect, 'error');
        return new Response(wav);
      } });
    assert.equal(result.cached, false);
    assert.equal(paidCalls, 1);
  } finally { setRequestTransport((...args) => globalThis.fetch(...args)); await fs.rm(cacheDir, { recursive: true, force: true }); }
});

test('WAV finalizes estimated RIFF and streaming data sizes from complete sample frames', () => {
  const normal = wavFixture();
  assert.deepEqual(normalizeWav(normal), normal);
  for (const size of [0, 0xffffffff, 0x7fffffff, 200000]) {
    const cloud = Buffer.from(normal); cloud.writeUInt32LE(size, 4); cloud.writeUInt32LE(size, 40);
    assert.deepEqual(normalizeWav(cloud), normal);
    assert.equal(cloud.readUInt32LE(4), size, 'does not modify source bytes');
  }
  const mismatchedRiff = Buffer.from(normal); mismatchedRiff.writeUInt32LE(12, 4);
  assert.deepEqual(normalizeWav(mismatchedRiff), normal);
  assert.throws(() => normalizeWav(normal.subarray(0, normal.length - 1)), /采样帧不完整/);
  assert.throws(() => normalizeWav(normal.subarray(0, 44)), /采样帧不完整/);
  assert.throws(() => normalizeWav(Buffer.from('<Error>AccessDenied</Error>')), /RIFF/);
  const badFormat = Buffer.from(normal); badFormat.writeUInt16LE(0, 32);
  assert.throws(() => normalizeWav(badFormat), /采样格式/);
});

test('WAV preserves extra RIFF metadata chunks and validates chunk bounds', () => {
  const normal = wavFixture();
  const metadata = Buffer.alloc(12); metadata.write('JUNK'); metadata.writeUInt32LE(3, 4); metadata.write('abc', 8);
  const withMetadata = Buffer.concat([normal.subarray(0, 12), metadata, normal.subarray(12)]);
  withMetadata.writeUInt32LE(withMetadata.length - 8, 4);
  assert.deepEqual(normalizeWav(withMetadata), withMetadata);
  const bad = Buffer.from(withMetadata); bad.writeUInt32LE(1000, 16);
  assert.throws(() => normalizeWav(bad), /分块内容不完整/);
});

test('downloaded WAV with streaming lengths is normalized before playback and caching', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirro-tts-wav-'));
  const streaming = wavFixture(); streaming.writeUInt32LE(0xffffffff, 4); streaming.writeUInt32LE(0xffffffff, 40);
  let paidCalls = 0, downloaded = 0;
  setRequestTransport(async () => { paidCalls++; return Response.json({ output: { audio: { url: 'https://audio.example/file.wav' } } }); });
  const options = { text: '流式文件头兼容测试。', apiKey: 'secret', baseUrl: 'https://workspace.example/compatible-mode/v1', cacheDir,
    fetchAudio: async () => { downloaded++; return new Response(streaming, { headers: { 'Content-Length': String(streaming.length) } }); } };
  try {
    const first = await synthesize(options);
    assert.deepEqual(Buffer.from(first.audio), wavFixture());
    const second = await synthesize(options);
    assert.equal(second.cached, true); assert.equal(paidCalls, 1); assert.equal(downloaded, 1);
    const [file] = await fs.readdir(cacheDir);
    assert.deepEqual(await fs.readFile(path.join(cacheDir, file)), wavFixture());
    await assert.rejects(synthesize({ ...options, text: '下载被截断。', fetchAudio: async () => new Response(streaming, { headers: { 'Content-Length': String(streaming.length + 20) } }) }), /下载未完成/);
  } finally { setRequestTransport((...args) => globalThis.fetch(...args)); await fs.rm(cacheDir, { recursive: true, force: true }); }
});
