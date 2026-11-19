export const ANALYSIS_STEPS = [
  { id: 'validate', label: '校验视频' }, { id: 'prepare', label: '准备素材' },
  { id: 'upload', label: '上传视频' }, { id: 'analyze', label: '理解与整理' },
  { id: 'save', label: '保存笔记' }, { id: 'cleanup', label: '清理临时文件' },
];
export function applyProgress(previous, event) {
  if (!event || typeof event !== 'object') return previous;
  const next = { ...previous, ...event, visited: [...(previous?.visited || [])] };
  if (event.stage && !next.visited.includes(event.stage)) next.visited.push(event.stage);
  if (event.stage !== previous?.stage) { next.percent = null; next.current = null; next.total = null; }
  if (Number.isFinite(event.percent)) next.percent = Math.max(0, Math.min(100, event.percent));
  if (Number.isFinite(event.current)) next.current = event.current;
  if (Number.isFinite(event.total)) next.total = event.total;
  return next;
}
