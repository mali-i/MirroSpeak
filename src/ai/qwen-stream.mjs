export async function collectGeneration(stream, { signal, progress }) {
  const response = { choices: [{ index: 0, message: { content: '' }, finish_reason: null }], _stream: { closedNormally: false, frames: 0 } };
  for await (const chunk of stream) {
    signal?.throwIfAborted();
    response._stream.frames++;
    if (chunk.error) throw new Error('服务商在流式生成过程中返回错误，未保存不完整笔记。');
    if (chunk.usage) response.usage = chunk.usage;
    const choice = chunk.choices?.find(item => (item.index ?? 0) === 0);
    if (typeof choice?.delta?.content === 'string') response.choices[0].message.content += choice.delta.content;
    if (choice?.finish_reason) response.choices[0].finish_reason = choice.finish_reason;
    const characters = response.choices[0].message.content.length;
    if (characters > 2 * 1024 * 1024) throw new Error('笔记响应过大，已停止接收。');
    progress({ stage: 'analyze', message: characters ? `正在接收笔记内容，已收到 ${characters.toLocaleString()} 字符…` : '正在等待模型输出笔记…', receivedCharacters: characters, lastActivityAt: Date.now() });
  }
  response._stream.closedNormally = true;
  return response;
}
