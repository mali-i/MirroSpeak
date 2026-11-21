// Copy the complete compatible-mode/v1 endpoint from the matching Bailian workspace.
export const DEFAULT_BASE_URL = '';
export const DEFAULT_MODEL = 'qwen3.8-omni-flash';
export function normalizeBaseUrl(value = DEFAULT_BASE_URL) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请填写阿里云百炼工作空间的 API Base URL。');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('API Base URL 格式无效。'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('API Base URL 请使用 HTTPS；本机服务可使用 HTTP。');
  if (url.username || url.password || url.search || url.hash) throw new Error('Base URL 不能包含账号、密码、查询参数或片段。');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
export function normalizeVideoUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('视频链接格式无效。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('视频链接须为无账号密码的 HTTPS 公网地址。');
  return url.href;
}
