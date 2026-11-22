export function externalUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('链接地址无效。');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('请填写完整的 HTTP 或 HTTPS 链接。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('仅支持不含登录信息的 HTTP 或 HTTPS 链接。');
  return url.href;
}

export function validateAnnotation(value) {
  if (!value || !Number.isSafeInteger(value.timeMs) || value.timeMs < 0) throw new Error('批注时间无效。');
  if (typeof value.text !== 'string' || value.text.length > 10000) throw new Error('批注最多可填写 10000 字。');
  if (!Array.isArray(value.links) || value.links.length > 20) throw new Error('每条批注最多支持 20 个引用。');
  const links = value.links.map(link => {
    if (!link || typeof link.title !== 'string' || link.title.length > 200) throw new Error('引用名称最多可填写 200 字。');
    return { url: externalUrl(link.url), title: link.title.trim() };
  });
  const text = value.text.trim();
  if (!text && !links.length) throw new Error('请填写批注内容或添加引用链接。');
  return { timeMs: value.timeMs, text, links };
}
