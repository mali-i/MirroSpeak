// Cloud synthesis may leave estimated/streaming sizes in an otherwise complete
// WAV. Validate the chunks and sample frames, then finalize its size fields.
export function normalizeWav(input) {
  const bytes = Buffer.from(input);
  const fail = reason => { throw new Error(`WAV 音频无法读取（${reason}；已接收 ${bytes.length} 字节）。`); };
  if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') fail('缺少 RIFF/WAVE 文件头');
  let offset = 12, alignment = 0, dataFound = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('分块头不完整');
    const id = bytes.toString('ascii', offset, offset + 4);
    let size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8, remaining = bytes.length - start;
    if (id === 'data') {
      if (!alignment || dataFound) fail('音频数据块顺序无效');
      // For a streaming final data chunk, 0/oversized lengths are placeholders.
      // Only use bytes from a successfully completed HTTP response.
      if (size === 0 || size > remaining) { size = remaining; bytes.writeUInt32LE(size, offset + 4); }
      if (!size || size % alignment) fail('采样帧不完整');
      dataFound = true;
    } else if (size > remaining) fail('分块内容不完整');
    if (id === 'fmt ') {
      if (alignment || dataFound || size < 16) fail('格式块无效');
      let format = bytes.readUInt16LE(start);
      if (format === 0xfffe && size >= 40) format = bytes.readUInt16LE(start + 24);
      const channels = bytes.readUInt16LE(start + 2), sampleRate = bytes.readUInt32LE(start + 4), bits = bytes.readUInt16LE(start + 14);
      alignment = bytes.readUInt16LE(start + 12);
      if (![1, 3].includes(format) || !channels || !sampleRate || !bits || bits % 8 || alignment !== channels * bits / 8) fail('不支持的采样格式');
    }
    offset = start + size + (size % 2);
    if (offset > bytes.length) fail('分块填充不完整');
  }
  if (!dataFound) fail('缺少音频数据块');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return bytes;
}
