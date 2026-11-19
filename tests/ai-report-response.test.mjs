import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportResponse, parseReportText } from '../src/ai/report-response.mjs';
const part = { title: '回顾', text: '我还没决定，例子里包含 {大括号} 和 "引号"。', startSeconds: 0, endSeconds: 5 };
const report = { title: '个人笔记', summary: '保留不确定性', chapters: [part], materials: [], notes: [part] };
const envelope = (text, finishReason = 'STOP') => ({ candidates: [{ finishReason, content: { parts: [{ text: 'reasoning', thought: true }, { text }] } }] });

test('parses plain JSON, fenced JSON, and a single complete JSON object with surrounding prose', () => {
  const json = JSON.stringify(report);
  for (const text of [json, `\uFEFF${json}`, '```json\n' + json + '\n```', '整理结果如下：\n' + json + '\n以上为笔记。']) {
    assert.equal(parseReportResponse(envelope(text), 10).notes[0].text, part.text);
  }
});
test('joins split text parts and excludes only explicit thought parts', () => {
  const json = JSON.stringify(report);
  const response = envelope('');
  response.candidates[0].content.parts = [{ text: 'reasoning', thought: true }, { text: json.slice(0, 10) }, { text: json.slice(10) }];
  assert.equal(parseReportResponse(response, 10).title, report.title);
});
test('rejects incomplete, ambiguous and invalid output without repairing it', () => {
  assert.throws(() => parseReportText('{"notes": ['), /未闭合/);
  assert.throws(() => parseReportText('{}\n{}'), /多份 JSON/);
  assert.throws(() => parseReportText('```json\n{"a":1,}\n```'), /语法/);
  assert.throws(() => parseReportResponse(envelope('我无法读取视频'), 10), /没有可解析/);
  assert.throws(() => parseReportResponse(envelope(JSON.stringify(report), 'MAX_TOKENS'), 10), /输出上限/);
  assert.throws(() => parseReportResponse(envelope(JSON.stringify({ ...report, notes: [] })), 10), /没有生成个人笔记/);
  assert.throws(() => parseReportResponse(envelope(JSON.stringify({ ...report, notes: [{ ...part, endSeconds: 200 }] })), 10), /超出视频范围/);
});
test('identifies incompatible response envelopes, missing text, and service errors', () => {
  assert.throws(() => parseReportResponse({ choices: [] }, 10), /OpenAI 格式/);
  assert.throws(() => parseReportResponse({ error: {} }, 10), /错误对象/);
  assert.throws(() => parseReportResponse({ candidates: [] }, 10), /没有返回候选/);
  assert.throws(() => parseReportResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'thinking' }] } }] }, 10), /没有返回报告正文/);
  assert.throws(() => parseReportResponse(envelope(''), 10), error => error.code === 'REPORT_RESPONSE_INVALID');
});
