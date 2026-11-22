import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnnotation, externalUrl } from '../src/ai/annotations.mjs';
test('annotations accept text or references and reject empty or invalid data', () => {
  assert.equal(validateAnnotation({ timeMs: 0, text: ' 更正 ', links: [] }).text, '更正');
  assert.equal(validateAnnotation({ timeMs: 2000, text: '', links: [{ url: 'https://weibo.com/a', title: '' }] }).links.length, 1);
  for (const value of [ { timeMs: -1, text: 'x', links: [] }, { timeMs: 0, text: ' ', links: [] }, { timeMs: 0, text: 'x', links: [{ url: 'javascript:alert(1)', title: '' }] } ]) assert.throws(() => validateAnnotation(value));
  for (const url of ['file:///etc/passwd', 'https://user:pass@example.com', 'not a url']) assert.throws(() => externalUrl(url));
});
