import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportResponse, parseReportText } from '../src/ai/report-response.mjs';
const part = { title: '回顾', text: '我还没决定，例子里包含 {大括号} 和 "引号"。', takeaway: '核心意思', type: '观点', sources: [{ startSeconds: 0, endSeconds: 5 }] };
const report = { title: '个人笔记', summary: '保留不确定性', schemaVersion: 2, uncertainties: [], materials: [], notes: [part] };
const envelope = (text, finishReason = 'stop') => ({ choices: [{ finish_reason: finishReason, message: { content: text } }] });

test('parses plain JSON, fenced JSON, and a single complete JSON object with surrounding prose', () => {
  const json = JSON.stringify(report);
  for (const text of [json, `\uFEFF${json}`, '```json\n' + json + '\n```', '整理结果如下：\n' + json + '\n以上为笔记。']) {
    assert.equal(parseReportResponse(envelope(text), 10).notes[0].text, part.text);
  }
});
test('rejects incomplete, ambiguous and invalid output without repairing it', () => {
  assert.throws(() => parseReportText('{"notes": ['), /未闭合/);
  assert.throws(() => parseReportText('{}\n{}'), /多份 JSON/);
  assert.throws(() => parseReportText('```json\n{"a":1,}\n```'), /语法/);
  assert.throws(() => parseReportResponse(envelope('我无法读取视频'), 10), /没有可解析/);
  assert.throws(() => parseReportResponse(envelope(JSON.stringify(report), 'length'), 10), /输出上限/);
  assert.throws(() => parseReportResponse(envelope(JSON.stringify({ ...report, notes: [] })), 10), /没有生成个人笔记/);
  assert.throws(() => parseReportResponse(envelope(JSON.stringify({ ...report, notes: [{ ...part, sources: [{ startSeconds: 0, endSeconds: 200 }] }] })), 10), /超出视频范围/);
});
test('rejects missing candidates, empty text, and abnormal completion', () => {
  assert.throws(() => parseReportResponse({ choices: [] }, 10), /候选/);
  assert.throws(() => parseReportResponse({ error: {} }, 10), /错误对象/);
  assert.throws(() => parseReportResponse(envelope(''), 10), /未返回报告正文/);
  assert.throws(() => parseReportResponse(envelope(JSON.stringify(report), null), 10), /未正常完成/);
});

test('legacy model output is explicitly rejected as non-reparseable', () => {
  const old = { title: '旧笔记', summary: '概览', chapters: [], notes: [{ title: '话题', text: '内容', startSeconds: 0, endSeconds: 5 }], materials: [] };
  assert.throws(() => parseReportResponse(envelope(JSON.stringify(old)), 10), error => error.code === 'REPORT_RESPONSE_INVALID' && error.recoverable === false && /旧格式/.test(error.message));
});
