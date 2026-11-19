export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';

// Base URL is the service root, optionally with a proxy path prefix.
export function normalizeBaseUrl(value = DEFAULT_BASE_URL) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请输入 API Base URL。');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('API Base URL 格式无效。'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('API Base URL 请使用 HTTPS；本机服务可使用 HTTP。');
  if (url.username || url.password || url.search || url.hash) throw new Error('Base URL 不能包含账号、密码、查询参数或片段。');
  let prefix = url.pathname.replace(/\/+$/, '').replace(/\/v1beta$/, '');
  if (url.hostname === 'api.teamorouter.com' && prefix === '/v1') prefix = '';
  return `${url.origin}${prefix}`;
}

export function apiEndpoint(baseUrl, resource) {
  return `${normalizeBaseUrl(baseUrl)}/v1beta/${resource}`;
}

export function uploadEndpoint(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/upload/v1beta/files`;
}

export function uploadSession(baseUrl, value) {
  if (!value) throw new Error('服务商未返回上传会话地址。中转站需要支持 Gemini Files API。');
  const base = normalizeBaseUrl(baseUrl);
  let url;
  try { url = new URL(value, `${base}/`); } catch { throw new Error('服务商返回了无效的上传地址。'); }
  if (url.origin !== new URL(base).origin || url.username || url.password || url.hash) {
    throw new Error('上传会话地址与所配置服务地址不同，已停止发送视频和 Key。请让中转站返回同源上传地址。');
  }
  return url.href;
}

export function isTeamoRouter(baseUrl) {
  return new URL(normalizeBaseUrl(baseUrl)).hostname === 'api.teamorouter.com';
}
