import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BASE_URL, normalizeBaseUrl, apiEndpoint, uploadEndpoint, uploadSession } from '../src/ai/endpoint.mjs';

test('base URLs support official service, proxy prefixes, and a pasted v1beta suffix', () => {
  assert.equal(normalizeBaseUrl(), DEFAULT_BASE_URL);
  assert.equal(normalizeBaseUrl(' https://relay.example/gemini/v1beta/ '), 'https://relay.example/gemini');
  assert.equal(apiEndpoint('https://relay.example/gemini/', 'models/test'), 'https://relay.example/gemini/v1beta/models/test');
  assert.equal(uploadEndpoint('https://relay.example/gemini/v1beta'), 'https://relay.example/gemini/upload/v1beta/files');
  assert.equal(normalizeBaseUrl('http://localhost:8000/'), 'http://localhost:8000');
  assert.equal(normalizeBaseUrl('http://[::1]:8000/'), 'http://[::1]:8000');
});
test('invalid base URLs cannot carry credentials, query keys, or nonlocal plaintext', () => {
  for (const value of ['', 'invalid', 'file:///tmp/api', 'http://relay.example', 'https://user:secret@relay.example', 'https://relay.example?key=secret', 'https://relay.example#fragment']) assert.throws(() => normalizeBaseUrl(value));
});
test('upload sessions retain proxy path/query and reject credential forwarding to a different host', () => {
  assert.equal(uploadSession('https://relay.example/gemini', 'session?id=123'), 'https://relay.example/gemini/session?id=123');
  assert.equal(uploadSession('https://relay.example/gemini', '/uploads/session'), 'https://relay.example/uploads/session');
  assert.throws(() => uploadSession('https://relay.example', 'https://generativelanguage.googleapis.com/session'), /不同/);
  assert.throws(() => uploadSession('https://relay.example', 'https://user:password@relay.example/session'), /不同/);
  assert.throws(() => uploadSession('https://relay.example', null), /Files API/);
});
