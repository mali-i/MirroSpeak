// Linux may report encryption as available while using a public fallback password.
export function isSecureStorageAvailable(storage, platform = process.platform) {
  try {
    if (!storage.isEncryptionAvailable()) return false;
    if (platform !== 'linux') return true;
    return ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(storage.getSelectedStorageBackend?.());
  } catch {
    return false;
  }
}
