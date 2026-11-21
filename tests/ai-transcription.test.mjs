import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { transcriptText, transcribeLocal } from '../src/ai/transcription.mjs';
import { analyze } from '../src/ai/qwen.mjs';
const transcript = { model: 'base', segments: [{ start: 0, end: 4, text: '我今天想讨论如何安排工作。' }] };
test('transcription validates speech and timestamps', () => {
  assert.match(transcriptText(transcript, 10), /0.00–4.00 秒/);
  for (const segments of [[], [{ start: -1, end: 4, text: '错误' }], [{ start: 0, end: 30, text: '错误' }]]) assert.throws(() => transcriptText({ segments }, 10));
});
test('Qwen4 receives cached timestamped speech together with video in one billable call', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'speech-cache-test-'));
  const sourceHash = 'a'.repeat(64), originalFetch = globalThis.fetch;
  await fs.writeFile(path.join(cacheDir, sourceHash + '-base-v1.json'), JSON.stringify(transcript));
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'qwen4-max');
    assert.equal(body.messages[0].content[0].type, 'video_url');
    assert.match(body.messages[0].content[1].text, /我今天想讨论如何安排工作/);
    assert.match(body.messages[0].content[1].text, /0.00–4.00 秒/);
    const segment = { title: '安排工作', text: '我想讨论如何安排工作。', startSeconds: 0, endSeconds: 4 };
    const report = { title: '工作', summary: '安排工作', chapters: [segment], materials: [], notes: [segment] };
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(report) }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const result = await analyze({ apiKey: 'key', baseUrl: 'https://workspace.example/v1', model: 'qwen4-max', filePath: '/not-read-with-url.mp4', videoUrl: 'https://bucket.example/video.mp4', duration: 10, transcriptionCacheDir: cacheDir, sourceHash });
    assert.equal(calls, 1); assert.equal(result.speechSource, 'local-whisper'); assert.equal(result.transcriptionModel, 'base');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(transcribeLocal({ filePath: '', duration: 10, cacheDir, sourceHash, signal: controller.signal }), { name: 'AbortError' });
  } finally { globalThis.fetch = originalFetch; await fs.rm(cacheDir, { recursive: true, force: true }); }
});
