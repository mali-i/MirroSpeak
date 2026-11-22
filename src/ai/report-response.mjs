import { validateReport } from './core.mjs';

function invalid(message, recoverable = true) {
  const error = new Error(message);
  error.code = 'REPORT_RESPONSE_INVALID';
  error.recoverable = recoverable;
  return error;
}

// Only remove presentation wrappers. Never repair missing fields or truncated JSON.
export function parseReportText(text) {
  const value = text.replace(/^\uFEFF/, '').trim();
  try { return JSON.parse(value); } catch { /* inspect wrappers */ }
  const blocks = [...value.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi)];
  if (blocks.length === 1) {
    try { return JSON.parse(blocks[0][1].trim()); } catch { throw invalid('报告的 JSON 代码块语法不完整或无效，已保留响应，可重新解析或重新分析。'); }
  }
  // Locate complete outer objects while respecting quotes and escaped braces.
  const objects = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (start < 0) { if (char === '{') { start = index; depth = 1; } continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try { objects.push(JSON.parse(value.slice(start, index + 1))); } catch { throw invalid('模型返回的 JSON 语法无效，未自动修补内容。'); }
      start = -1;
    }
  }
  if (start >= 0) throw invalid('报告的 JSON 内容未闭合，可能被截断，未保存不完整笔记。');
  if (objects.length !== 1) throw invalid(objects.length ? '响应包含多份 JSON，无法确定应保存哪一份。' : '模型返回了文本，但没有可解析的 JSON 报告。中转站可能未传递结构化输出参数。');
  return objects[0];
}

export function parseReportResponse(response, duration) {
  if (response?.error) throw invalid('服务商返回错误对象，未生成报告。', false);
  const choice = response?.choices?.[0];
  if (!choice) throw invalid('服务商响应缺少文本候选结果，请检查 Qwen-Omni 接口配置。', false);
  if (choice.finish_reason === 'length') throw invalid('模型达到输出上限，报告被截断，未保存不完整笔记。', false);
  const text = choice.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw invalid('服务商未返回报告正文，当前响应无法重新解析为笔记。', false);
  if (choice.finish_reason !== 'stop') throw invalid('模型未正常完成输出，未保存不完整笔记。', false);
  const raw = parseReportText(text);
  if (raw && typeof raw === 'object' && raw.schemaVersion !== 2) {
    throw invalid('模型返回了旧格式或缺少新版格式标识（schemaVersion: 2）。当前响应无法转换为新版主题笔记；请完全退出并重新启动应用后重新分析。仅重新解析已有响应无法解决。', false);
  }
  try { return validateReport(raw, duration); }
  catch (error) { throw invalid(`报告已解析，但内容校验失败：${error.message}`); }
}
