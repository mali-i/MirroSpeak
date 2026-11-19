import { validateReport } from './core.mjs';

function invalid(message) {
  const error = new Error(message);
  error.code = 'REPORT_RESPONSE_INVALID';
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
  if (response?.error) throw invalid('服务商在成功状态码中返回了错误对象，未生成报告。');
  if (!Array.isArray(response?.candidates)) {
    throw invalid(response?.choices ? '中转站返回了 OpenAI 格式，当前请求要求 Gemini 原生 candidates 格式。' : '服务商响应缺少 Gemini candidates 字段，请检查原生协议兼容性。');
  }
  const candidate = response.candidates[0];
  if (!candidate) throw invalid('服务商没有返回候选结果，可能被内容规则拦截。');
  if (candidate.finishReason !== 'STOP') throw invalid(candidate.finishReason === 'MAX_TOKENS' ? '模型达到输出上限，报告被截断，未保存不完整笔记。' : '模型没有正常完成输出，可能被内容规则拦截或中转站未传递完成状态。');
  const parts = candidate.content?.parts;
  if (!Array.isArray(parts)) throw invalid('模型响应缺少 content.parts 文本结构。');
  const text = parts.filter(part => part && part.thought !== true && typeof part.text === 'string').map(part => part.text).join('');
  if (!text.trim()) throw invalid('模型没有返回报告正文（可能仅返回了思考内容）。');
  const raw = parseReportText(text);
  try { return validateReport(raw, duration); }
  catch (error) { throw invalid(`报告已解析，但内容校验失败：${error.message}`); }
}
