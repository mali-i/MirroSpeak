import test from 'node:test';
import assert from 'node:assert/strict';
import { readGeneration } from '../src/ai/gemini-stream.mjs';
import { parseReportResponse } from '../src/ai/report-response.mjs';
const endpoint = 'https://relay.example/v1beta/models/test:streamGenerateContent?alt=sse';
const report = { title: '笔记', summary: '我的回顾', chapters: [], materials: [], notes: [{ title: '计划', text: '我还没决定。', startSeconds: 0, endSeconds: 5 }] };
function streamed(bytes, chunkSize = 1) {
  return new Response(new ReadableStream({ start(controller) { for (let offset = 0; offset < bytes.length; offset += chunkSize) controller.enqueue(bytes.slice(offset, offset + chunkSize)); controller.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
}
test('stream reader handles fragmented UTF8, CRLF, heartbeat and report deltas', async () => {
  const text = JSON.stringify(report);
  const events = [': heartbeat', 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'reasoning', thought: true }, { text: text.slice(0, 20) }] } }] }), 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: text.slice(20) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 100 } }), 'data: [DONE]'];
  const progress = [];
  const result = await readGeneration(streamed(new TextEncoder().encode(events.join('\r\n\r\n') + '\r\n\r\n')), { endpoint, progress: event => progress.push(event) });
  assert.equal(parseReportResponse(result, 10).notes[0].text, report.notes[0].text);
  assert.equal(result.usageMetadata.totalTokenCount, 100);
  assert(progress.some(event => event.stage === 'analyze'));
});
test('normal EOF without a model finish marker is not treated as a completed report', async () => {
  const text = 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(report) }] } }] }) + '\n\n';
  const result = await readGeneration(streamed(new TextEncoder().encode(text)), { endpoint, progress() {} });
  assert.throws(() => parseReportResponse(result, 10), /没有正常完成/);
});
test('mid-stream disconnection rejects even after receiving a valid-looking report', async () => {
  let count = 0;
  const response = new Response(new ReadableStream({ pull(controller) {
    if (count++ === 0) controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(report) }] }, finishReason: 'STOP' }] }) + '\n\n'));
    else controller.error(new Error('net::ERR_CONNECTION_CLOSED'));
  } }), { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(readGeneration(response, { endpoint, progress() {} }), /已接收.*ERR_CONNECTION_CLOSED/);
});
test('stream errors do not silently fall back to a second billable request', async () => {
  const response = streamed(new TextEncoder().encode('data: {bad json}\n\n'));
  await assert.rejects(readGeneration(response, { endpoint, progress() {} }), /流式数据格式/);
});
