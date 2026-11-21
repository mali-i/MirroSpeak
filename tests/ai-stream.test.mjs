import test from 'node:test';
import assert from 'node:assert/strict';
import { collectGeneration } from '../src/ai/qwen-stream.mjs';
import { parseReportResponse } from '../src/ai/report-response.mjs';
const segment = { title: '内容', text: '我还没决定。', startSeconds: 0, endSeconds: 2 };
const report = { title: '笔记', summary: '摘要', chapters: [segment], materials: [], notes: [segment] };
const text = JSON.stringify(report);
test('collects content separately from reasoning and retains trailing usage', async () => {
  async function* chunks() {
    yield { choices: [{ index: 0, delta: { reasoning_content: 'thinking', content: text.slice(0, 15) } }] };
    yield { choices: [{ index: 0, delta: { content: text.slice(15) }, finish_reason: 'stop' }] };
    yield { choices: [], usage: { total_tokens: 100 } };
  }
  const result = await collectGeneration(chunks(), { progress() {} });
  assert.equal(parseReportResponse(result, 10).title, '笔记');
  assert.equal(result.usage.total_tokens, 100);
});
test('EOF without completion and reasoning-only output cannot save a report', async () => {
  for (const content of [text, '']) {
    async function* chunks() { yield { choices: [{ delta: { content, reasoning_content: 'thinking' } }] }; }
    const result = await collectGeneration(chunks(), { progress() {} });
    assert.throws(() => parseReportResponse(result, 10));
  }
});
test('disconnect after valid-looking output rejects instead of saving', async () => {
  async function* chunks() {
    yield { choices: [{ delta: { content: text }, finish_reason: 'stop' }] };
    throw new Error('connection closed');
  }
  await assert.rejects(collectGeneration(chunks(), { progress() {} }), /connection closed/);
});
