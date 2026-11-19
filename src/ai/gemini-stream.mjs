import { networkError } from './network.mjs';

export async function readGeneration(response, { endpoint, signal, progress }) {
  if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
    try { return await response.json(); }
    catch (error) { throw networkError(error, endpoint); }
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const result = { candidates: [{ content: { parts: [] } }] };
  let buffer = '', received = 0, characters = 0, lastUpdate = 0;
  const frame = value => {
    const data = value.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (data && data.trim() !== '[DONE]') {
      let chunk;
      try { chunk = JSON.parse(data); } catch { throw new Error('服务商返回的流式数据格式无效，未保存不完整笔记。'); }
      if (chunk.error) throw new Error('服务商在流式生成过程中返回错误，未保存不完整笔记。');
      if (chunk.usageMetadata) result.usageMetadata = chunk.usageMetadata;
      const candidate = chunk.candidates?.find(item => (item.index ?? 0) === 0);
      if (candidate) {
        for (const part of candidate.content?.parts || []) {
          if (typeof part.text !== 'string' || part.thought === true) continue;
          result.candidates[0].content.parts.push({ text: part.text }); characters += part.text.length;
        }
        if (candidate.finishReason) result.candidates[0].finishReason = candidate.finishReason;
      }
    }
    if (Date.now() - lastUpdate >= 300) {
      progress({ stage: 'analyze', message: characters ? `正在接收笔记内容，已收到 ${characters.toLocaleString()} 字符…` : '服务端连接已建立，正在等待模型输出…', receivedCharacters: characters, lastActivityAt: Date.now() });
      lastUpdate = Date.now();
    }
  };
  progress({ stage: 'analyze', message: '服务端已建立流式连接，正在理解视频并整理笔记…', lastActivityAt: Date.now() });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 8 * 1024 * 1024) throw new Error('流式响应超过 8 MB，已停止接收。');
      buffer += decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        frame(buffer.slice(0, match.index)); buffer = buffer.slice(match.index + match[0].length);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) frame(buffer);
    return result;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
    if (error.message.includes('net::') || error.cause || error.message === 'fetch failed') {
      const failure = networkError(error, endpoint);
      failure.message = `生成个人笔记失败（已接收 ${characters} 字符）：${failure.message}`;
      throw failure;
    }
    throw error;
  } finally { reader.releaseLock(); }
}
