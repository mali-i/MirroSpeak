import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBaseUrl, normalizeVideoUrl } from '../src/ai/endpoint.mjs';
test('preserves workspace path and validates credentials and schemes', () => {
  assert.equal(normalizeBaseUrl(' https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/ '), 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
  for (const value of ['', 'https://user:pass@example.com/v1', 'https://example.com/v1?key=secret', 'http://example.com/v1']) assert.throws(() => normalizeBaseUrl(value));
  assert.equal(normalizeBaseUrl('http://127.0.0.1:4321/v1'), 'http://127.0.0.1:4321/v1');
});
test('signed video links retain query parameters but reject invalid schemes', () => {
  assert.equal(normalizeVideoUrl('https://bucket.example/video.mp4?signature=abc'), 'https://bucket.example/video.mp4?signature=abc');
  for (const value of ['file:///video.mp4', 'http://example.com/video', 'https://user:password@example.com/video']) assert.throws(() => normalizeVideoUrl(value));
});
