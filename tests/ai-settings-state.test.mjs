import test from 'node:test';
import assert from 'node:assert/strict';
import { savedAISettings, publishAISettings, refreshAISettings } from '../src/ai/settings-state.mjs';
import { createAnalysisPlan } from '../src/ai/progress.mjs';

test('saved model changes update analysis plans and refresh uses persisted settings without retaining keys', async () => {
  publishAISettings({ model: 'qwen4-max', baseUrl: 'https://example.com', hasKey: true, apiKey: 'secret' });
  assert(createAnalysisPlan(savedAISettings.value.model).steps.some(step => step.id === 'transcribe'));
  const bridge = { ai: async action => {
    assert.equal(action, 'settings');
    return { success: true, data: { model: 'qwen3.8-omni-flash', baseUrl: 'https://saved.example.com', hasKey: true } };
  } };
  await refreshAISettings(bridge);
  assert.equal(createAnalysisPlan(savedAISettings.value.model).steps.some(step => step.id === 'transcribe'), false);
  assert.equal(savedAISettings.value.baseUrl, 'https://saved.example.com');
  assert.equal(savedAISettings.value.apiKey, undefined);
  const previous = savedAISettings.value;
  await assert.rejects(refreshAISettings({ ai: async () => ({ success: false, error: '读取失败' }) }), /读取失败/);
  assert.equal(savedAISettings.value, previous);
});
