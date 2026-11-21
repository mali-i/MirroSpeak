const sse = value => new Response(`data: ${JSON.stringify(value)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fingerprint, identify, validateReport, markdown } from '../src/ai/core.mjs';

const segment = { title: '计划', text: '我还没有确定下一步。', startSeconds: 1, endSeconds: 9 };
const raw = { title: '个人笔记', summary: '保留不确定性', chapters: [segment], materials: [segment], notes: [segment] };
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
  assert.equal(validateReport(raw, 10).notes[0].startMs, 1000);
  for (const startSeconds of [-1, NaN, '1', 11]) assert.throws(() => validateReport({ ...raw, notes: [{ ...segment, startSeconds }] }, 10));
  assert.throws(() => validateReport({ ...raw, chapters: [{ ...segment, endSeconds: 20 }] }, 10));
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
