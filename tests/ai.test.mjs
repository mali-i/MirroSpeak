const sse = value => new Response(`data: ${JSON.stringify(value)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fingerprint, identify, validateReport, markdown } from '../src/ai/core.mjs';

const segment = { title: '计划', text: '我还没有确定下一步。', takeaway: '核心意思', type: '观点', sources: [{ startSeconds: 1, endSeconds: 9 }] };
const raw = { title: '个人笔记', summary: '保留不确定性', schemaVersion: 2, uncertainties: [], materials: [segment], notes: [segment] };
test('renaming and moving preserve identity; changed bytes create a new identity', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'videolog-test-'));
  try {
    const first = path.join(dir, 'original.mp4'), moved = path.join(dir, 'renamed.mp4');
    await fs.writeFile(first, 'original-video');
    const original = identify([], await fingerprint(first), first);
    original.reports.push({ id: 'saved-report' });
    await fs.rename(first, moved);
    const same = identify([original], await fingerprint(moved), moved);
    assert.equal(same.id, original.id);
    assert.equal(same.reports[0].id, 'saved-report');
    await fs.writeFile(moved, 'modified-video');
    assert.notEqual(identify([original], await fingerprint(moved), moved).id, original.id);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('report validation converts to milliseconds and rejects invented timestamps', () => {
  assert.equal(validateReport(raw, 10).notes[0].sources[0].startMs, 1000);
  for (const startSeconds of [-1, NaN, '1', 11]) assert.throws(() => validateReport({ ...raw, notes: [{ ...segment, sources: [{ startSeconds, endSeconds: 9 }] }] }, 10));
  assert.throws(() => validateReport({ ...raw, notes: [{ ...segment, sources: [{ startSeconds: 1, endSeconds: 20 }] }] }, 10));
  assert.throws(() => validateReport({ ...raw, notes: [] }, 10));
  assert.throws(() => validateReport({ ...raw, summary: {} }, 10));
});
test('Markdown preserves edited notes and source times', () => {
  const report = validateReport(raw, 10);
  report.notes[0].text = '这是我编辑后的笔记。';
  const output = markdown(report);
  assert.match(output, /这是我编辑后的笔记/);
  assert.match(output, /0:01–0:09/);
});

test('v2 preserves multiple sources, typed materials and actionable uncertainties in exports', () => {
  const multiple = { ...segment, sources: [{ startSeconds: 1, endSeconds: 3 }, { startSeconds: 7, endSeconds: 9 }] };
  const report = validateReport({ ...raw, notes: [multiple], uncertainties: [{ title: '名称听辨不清', text: '请回看核对方法名称。', sources: [{ startSeconds: 4, endSeconds: 6 }] }] }, 10);
  assert.deepEqual(report.notes[0].sources, [{ startMs: 1000, endMs: 3000 }, { startMs: 7000, endMs: 9000 }]);
  const output = markdown(report);
  assert.match(output, /0:01–0:03、0:07–0:09/);
  assert.match(output, /【观点】/);
  assert.match(output, /名称听辨不清/);
  assert.match(output, /核心意思/);
  assert.equal(report.chapters, undefined);
});

test('v2 rejects missing evidence, invalid material types, empty text and excessive lists', () => {
  for (const patch of [
    { schemaVersion: 1 }, { uncertainties: undefined },
    { notes: [{ ...segment, sources: [] }] },
    { notes: [{ ...segment, takeaway: ' ' }] },
    { notes: Array(101).fill(segment) },
    { notes: [{ ...segment, sources: Array(21).fill({ startSeconds: 0, endSeconds: 1 }) }] },
    { materials: [{ ...segment, type: '猜测' }] },
    { uncertainties: [{ ...segment, sources: [{ startSeconds: 0, endSeconds: 10.1 }] }] },
  ]) assert.throws(() => validateReport({ ...raw, ...patch }, 10));
  assert.deepEqual(validateReport({ ...raw, materials: [], uncertainties: [] }, 10).materials, []);
});

test('paragraph-array bodies normalize losslessly for editing and export', () => {
  const report = validateReport({ ...raw, notes: [{ ...segment, text: ['第一段。', '第二段。'] }] }, 10);
  assert.equal(report.notes[0].text, '第一段。\n\n第二段。');
  assert.match(markdown(report), /第一段。\n\n第二段。/);
  for (const text of [[], ['正文', {}], ['正文', ' '], ['x'.repeat(60000), 'y'.repeat(60000)]]) {
    assert.throws(() => validateReport({ ...raw, notes: [{ ...segment, text }] }, 10), /notes\[0\]\.text/);
  }
  assert.throws(() => validateReport({ ...raw, notes: [{ ...segment, takeaway: [] }] }, 10), /notes\[0\]\.takeaway/);
});
