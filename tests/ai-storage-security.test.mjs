import test from 'node:test';
import assert from 'node:assert/strict';
import { isSecureStorageAvailable } from '../src/ai/storage-security.mjs';

const storage = (available, backend) => ({
  isEncryptionAvailable: () => available,
  getSelectedStorageBackend: () => backend,
});

test('rejects unavailable storage on every platform', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    assert.equal(isSecureStorageAvailable(storage(false, 'gnome_libsecret'), platform), false);
  }
});

test('rejects Linux fallback, unknown and missing backends', () => {
  for (const backend of ['basic_text', 'unknown', undefined]) {
    assert.equal(isSecureStorageAvailable(storage(true, backend), 'linux'), false);
  }
  assert.equal(isSecureStorageAvailable({ isEncryptionAvailable: () => true }, 'linux'), false);
});

test('accepts OS key stores and fails closed when storage throws', () => {
  for (const backend of ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']) {
    assert.equal(isSecureStorageAvailable(storage(true, backend), 'linux'), true);
  }
  for (const platform of ['darwin', 'win32']) {
    assert.equal(isSecureStorageAvailable(storage(true), platform), true);
  }
  assert.equal(isSecureStorageAvailable({ isEncryptionAvailable() { throw new Error('locked'); } }), false);
});
