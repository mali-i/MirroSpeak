import { Readable } from 'node:stream';

// Chromium honors system proxy/PAC settings; Node fetch may bypass them.
export function createElectronFetch(netFetch, netRequest) {
  return (endpoint, options = {}) => {
    const init = { ...options, credentials: 'omit' };
    // Chromium owns transfer framing and rejects a manually supplied length.
    const headers = new Headers(init.headers);
    headers.delete('content-length');
    init.headers = headers;
    // net.fetch hides redirect responses; net.request exposes their actual status.
    if (netRequest && !(init.body instanceof Readable)) return requestWithStatus(netRequest, endpoint, init);
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
  const messages = [error.message, error.cause?.message, ...(error.cause?.errors || []).map(item => item.message)].filter(Boolean).join(' ');
  const chromiumCode = messages.match(/\bERR_[A-Z_]+\b/)?.[0];
  const redirectBlocked = /redirect.*(?:cancel|block)|unexpected redirect/i.test(messages);
  const code = (redirectBlocked ? 'REDIRECT_BLOCKED' : null) || chromiumCode || codes.find(value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(value)) || 'NETWORK_ERROR';
  let hint = '请检查网络、系统代理和 API 地址。';
  if (code === 'REDIRECT_BLOCKED') hint = '服务商返回重定向，已阻止自动转发 Key 和视频。请检查 Base URL 与接口路径；请核对百炼工作空间的 API 地址。';
  else if (/ENOTFOUND|EAI_AGAIN|NAME_NOT_RESOLVED/.test(code)) hint = '域名解析失败，请检查 API 地址、DNS 和系统代理。';
  else if (/CONNECTION_CLOSED/.test(code)) hint = '服务端响应完成前连接被关闭，可能与代理、中转站或长请求超时有关；请勿连续重试，以免重复计费。';
  else if (/ECONNRESET|CONNECTION_RESET/.test(code)) hint = '连接被重置，请检查系统代理或中转站是否可访问。';
  else if (/PROXY|TUNNEL/.test(code)) hint = '代理连接失败，请检查系统代理是否正在运行。';
  else if (/CERT|TLS|SSL|SELF_SIGNED|VERIFY/.test(code)) hint = '安全连接或证书校验失败，请检查服务端证书、系统时间及代理证书配置。';
  else if (/TIMEOUT|TIMEDOUT|TIMED_OUT/.test(code)) hint = '连接超时，请检查系统代理或稍后重试。';
  else if (/ECONNREFUSED|CONNECTION_REFUSED/.test(code)) hint = '连接被拒绝，请检查服务端地址、端口或本机代理。';
  const result = new Error(`${redirectBlocked ? '接口重定向已拦截' : '网络连接失败'}（${new URL(endpoint).hostname}；${code}）。${hint}`);
  result.code = code;
  return result;
}

function requestWithStatus(netRequest, endpoint, options) {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(options.signal.reason); return; }
    let request;
    let settled = false;
    let streamController, headersSent = false;
    let uploadTimer;
    const finish = (error, response) => {
      if (settled) return;
      settled = true;
      clearInterval(uploadTimer);
      options.signal?.removeEventListener('abort', abort);
      if (headersSent) { if (error) streamController.error(error); else streamController.close(); }
      else if (error) reject(error); else resolve(response);
    };
    const abort = () => { finish(options.signal.reason || new DOMException('Cancelled', 'AbortError')); request?.abort(); };
    try {
      request = netRequest({ url: endpoint, method: options.method || 'GET', redirect: 'manual', credentials: 'omit', useSessionCookies: false });
      request.on('error', error => finish(error));
      request.on('abort', () => finish(new DOMException('Cancelled', 'AbortError')));
      request.on('redirect', (status, _method, location) => {
        // Never follow a redirect carrying an API Key or video metadata.
        finish(null, new Response(null, { status, headers: { Location: location } }));
        request.abort();
      });
      request.on('response', response => {
        clearInterval(uploadTimer);
        if (options.streamResponse) {
          const headers = new Headers();
          for (const [name, values] of Object.entries(response.headers)) for (const value of Array.isArray(values) ? values : [values]) headers.append(name, String(value));
          const body = new ReadableStream({ start(controller) { streamController = controller; }, cancel() { finish(new DOMException('Cancelled', 'AbortError')); request.abort(); } });
          headersSent = true;
          resolve(new Response(body, { status: response.statusCode, headers }));
        }
        const chunks = [];
        let length = 0;
        response.on('data', chunk => {
          if (settled) return;
          length += chunk.length;
          if (length > (options.maxResponseBytes || 8 * 1024 * 1024)) { finish(new Error('API response exceeds 8 MB')); request.abort(); return; }
          if (headersSent) streamController.enqueue(new Uint8Array(chunk));
          else chunks.push(Buffer.from(chunk));
        });
        response.on('error', error => finish(error));
        response.on('aborted', () => finish(new Error('net::ERR_CONNECTION_CLOSED')));
        response.on('end', () => {
          if (headersSent) { finish(); return; }
          try {
            const headers = new Headers();
            for (const [name, values] of Object.entries(response.headers)) {
              for (const value of Array.isArray(values) ? values : [values]) headers.append(name, String(value));
            }
            const body = [204, 205, 304].includes(response.statusCode) || options.method === 'HEAD' ? null : Buffer.concat(chunks);
            finish(null, new Response(body, { status: response.statusCode, headers }));
          } catch (error) { finish(error); }
        });
      });
      for (const [name, value] of options.headers) request.setHeader(name, value);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) { abort(); return; }
      if (options.onUploadProgress && options.body) {
        const updateUpload = () => {
          const info = request.getUploadProgress?.();
          if (info?.total > 0) options.onUploadProgress({ current: info.current, total: info.total, percent: info.current / info.total * 100 });
        };
        uploadTimer = setInterval(updateUpload, 250);
        request.on('finish', updateUpload);
      }
      request.end(options.body);
    } catch (error) { finish(error); request?.abort(); }
  });
}
