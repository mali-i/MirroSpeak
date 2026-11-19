import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { analyze } from '../src/ai/gemini.mjs';
import { compressForInline, INLINE_VIDEO_LIMIT } from '../src/ai/inline-video.mjs';
const exec = promisify(execFile);

test('TeamoRouter auto mode sends video inline in one generation request without Files calls', async () => {
  const oldFetch = globalThis.fetch;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'videolog-inline-test-'));
  const filePath = path.join(directory, 'video.mp4');
  await fs.writeFile(filePath, 'test-video-bytes');
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.teamorouter.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(init.body);
    const part = body.contents[0].parts[0];
    assert.equal(part.inlineData.mimeType, 'video/mp4');
    assert.equal(Buffer.from(part.inlineData.data, 'base64').toString(), 'test-video-bytes');
    assert.equal(part.fileData, undefined);
    const segment = { title: '笔记', text: '我还不确定。', startSeconds: 0, endSeconds: 5 };
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ title: '个人笔记', summary: '摘要', chapters: [segment], notes: [segment], materials: [] }) }] } }] });
  };
  try {
    const report = await analyze({ apiKey: 'test-key', baseUrl: 'https://api.teamorouter.com', model: 'gemini-test', filePath, duration: 10, progress() {}, remote() { assert.fail('no remote file should be created'); } });
    assert.equal(report.inputMode, 'inline');
    assert.equal(report.compressed, false);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = oldFetch; await fs.rm(directory, { recursive: true, force: true }); }
});

test('local compression keeps audio and timeline, limits size and removes its temporary copy', async context => {
  try { await exec('ffmpeg', ['-version']); await exec('ffprobe', ['-version']); } catch { context.skip('system ffmpeg/ffprobe not installed'); return; }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'videolog-compress-test-'));
  const filePath = path.join(directory, 'source.mp4');
  let prepared;
  try {
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '4', '-c:v', 'libx264', '-c:a', 'aac', '-y', filePath]);
    const original = await fs.readFile(filePath);
    prepared = await compressForInline({ filePath, duration: 4 });
    const metadata = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', prepared.filePath])).stdout);
    assert(metadata.streams.some(stream => stream.codec_type === 'audio'));
    const video = metadata.streams.find(stream => stream.codec_type === 'video');
    assert(video.width <= 320 && video.height <= 320);
    assert.equal(video.r_frame_rate, '2/1');
    assert(Math.abs(Number(metadata.format.duration) - 4) < 0.3);
    assert(Number(metadata.format.size) <= INLINE_VIDEO_LIMIT);
    assert.deepEqual(await fs.readFile(filePath), original);
    await prepared.cleanup();
    await assert.rejects(fs.access(prepared.filePath));
  } finally { await prepared?.cleanup(); await fs.rm(directory, { recursive: true, force: true }); }
});
