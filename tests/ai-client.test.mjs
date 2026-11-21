import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeAI } from '../src/ai/client.mjs';

test('old main process gives a restart instruction, not a secure-storage diagnosis', async () => {
  const bridge = { ai: async () => { throw new Error("Error invoking remote method 'ai:settings': Error: No handler registered for 'ai:settings'"); } };
  await assert.rejects(invokeAI(bridge, 'settings'), error => error.message.includes('npm start') && !error.message.includes('安全存储不可用'));
});
test('old preload is detected before invoking IPC', async () => {
  await assert.rejects(invokeAI({}, 'settings'), /完全退出应用/);
});
test('secure storage state comes only from a successful main response', async () => {
  const settings = { secureStorage: false, hasKey: false, model: 'qwen3.8-omni-flash' };
  assert.deepEqual(await invokeAI({ ai: async () => ({ success: true, data: settings }) }, 'settings'), settings);
  await assert.rejects(invokeAI({ ai: async () => ({ success: false, error: 'backend failed' }) }, 'settings'), /backend failed/);
});
