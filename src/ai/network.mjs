import { Readable } from 'node:stream';

// Chromium honors system proxy/PAC settings; Node fetch may bypass them.
export function createElectronFetch(netFetch) {
  return (endpoint, options = {}) => {
    const init = { ...options, credentials: 'omit' };
    // Chromium owns transfer framing and rejects a manually supplied length.
    const headers = new Headers(init.headers);
    headers.delete('content-length');
    init.headers = headers;
    if (init.body instanceof Readable) {
      init.body = Readable.toWeb(init.body);
      init.duplex = 'half';
    }
    return netFetch(endpoint, init);
  };
}

export function networkError(error, endpoint) {
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return error;
  const codes = [error.cause?.code, ...(error.cause?.errors || []).map(item => item.code), error.code];
  const chromiumCode = error.message?.match(/\bERR_[A-Z_]+\b/)?.[0];
  const code = chromiumCode || codes.find(value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(value)) || 'NETWORK_ERROR';
  let hint = '请检查网络、系统代理和 API 地址。';
  if (/ENOTFOUND|EAI_AGAIN|NAME_NOT_RESOLVED/.test(code)) hint = '域名解析失败，请检查 API 地址、DNS 和系统代理。';
  else if (/ECONNRESET|CONNECTION_RESET|CONNECTION_CLOSED/.test(code)) hint = '连接被重置，请检查系统代理或中转站是否可访问。';
  else if (/PROXY|TUNNEL/.test(code)) hint = '代理连接失败，请检查系统代理是否正在运行。';
  else if (/CERT|TLS|SSL|SELF_SIGNED|VERIFY/.test(code)) hint = '安全连接或证书校验失败，请检查服务端证书、系统时间及代理证书配置。';
  else if (/TIMEOUT|TIMEDOUT|TIMED_OUT/.test(code)) hint = '连接超时，请检查系统代理或稍后重试。';
  else if (/ECONNREFUSED|CONNECTION_REFUSED/.test(code)) hint = '连接被拒绝，请检查服务端地址、端口或本机代理。';
  return new Error(`网络连接失败（${new URL(endpoint).hostname}；${code}）。${hint}`);
}
