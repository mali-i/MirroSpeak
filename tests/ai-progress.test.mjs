import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProgress } from '../src/ai/progress.mjs';
import { fingerprint } from '../src/ai/core.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('switching to model waiting clears byte percentages and completes the upload step', () => {
  let task = applyProgress(null, { stage: 'upload', status: 'running', percent: 100, current: 50, total: 50 });
  task = applyProgress(task, { stage: 'analyze', message: '模型处理' });
  assert.equal(task.percent, null);
  assert.equal(task.current, null);
  assert.equal(task.total, null);
  assert.deepEqual(task.stepStates, { upload: 'done', analyze: 'active' });
  task = applyProgress(task, { stage: 'cleanup' });
  task = applyProgress(task, { stage: 'complete', status: 'complete', warning: '清理失败', finishedAt: 123 });
  assert.equal(task.warning, '清理失败');
  assert.equal(task.status, 'complete');
  assert.equal(task.finishedAt, 123);
});
test('progress clamps measured values and retains the failure phase after cleanup', () => {
  let task = applyProgress(null, { stage: 'prepare', percent: 120 });
  assert.equal(task.percent, 100);
  task = applyProgress(task, { stage: 'cleanup' });
  task = applyProgress(task, { stage: 'upload', status: 'failed', percent: -10 });
  assert.equal(task.percent, 0);
  assert.equal(task.stage, 'upload');
  assert.equal(task.status, 'failed');
});
test('identity checking reports measured bytes ending at full file size', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'videolog-progress-'));
  try {
    const filePath = path.join(directory, 'sample.mp4');
    await fs.writeFile(filePath, Buffer.alloc(200000));
    const events = [];
    await fingerprint(filePath, undefined, event => events.push(event));
    assert.equal(events.at(-1).current, 200000);
    assert.equal(events.at(-1).total, 200000);
    assert.equal(events.at(-1).percent, 100);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('analysis plans omit transcription for native audio/video models and name link submission', async () => {
  const { createAnalysisPlan } = await import('../src/ai/progress.mjs');
  const native = createAnalysisPlan('qwen3.8-omni-flash', 'https://example.com/video.mp4');
  assert.equal(native.steps.some(step => step.id === 'transcribe'), false);
  assert.equal(native.steps.find(step => step.id === 'upload').label, '提交素材链接');
  assert.equal(createAnalysisPlan('qwen3.8-omni-flash').steps.find(step => step.id === 'upload').label, '提交素材');
  assert.throws(() => createAnalysisPlan('qwen4-max'), /不在支持列表/);
  assert.equal(native.steps.some(step => step.id === 'cleanup'), false);
});

test('explicit step states preserve failures and leave unexecuted steps pending', () => {
  let task = applyProgress(null, { stage: 'validate', status: 'running' });
  task = applyProgress(task, { stage: 'prepare' });
  task = applyProgress(task, { message: '清理临时文件' });
  task = applyProgress(task, { stage: 'prepare', status: 'failed' });
  assert.deepEqual(task.stepStates, { validate: 'done', prepare: 'stopped' });
  assert.equal(task.stepStates.save, undefined);
  let success = applyProgress(null, { stage: 'save', status: 'running' });
  success = applyProgress(success, { stage: 'complete', status: 'complete' });
  assert.equal(success.stepStates.save, 'done');
});
