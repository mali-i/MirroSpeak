import { getModelProfile } from './models.mjs';

export function createAnalysisPlan(model, videoUrl) {
  getModelProfile(model);
  return {
    model,
    method: '直接理解画面与声音',
    steps: [
      { id: 'validate', label: '校验视频' },
      { id: 'prepare', label: '准备素材' },
      { id: 'upload', label: videoUrl?.trim() ? '提交素材链接' : '提交素材' },
      { id: 'analyze', label: '理解与整理' },
      { id: 'save', label: '保存笔记' },
    ],
  };
}
export function applyProgress(previous, event) {
  if (!event || typeof event !== 'object') return previous;
  const next = { ...previous, ...event };
  next.stepStates = { ...(previous?.stepStates || {}) };
  if (previous?.stage && event.stage && event.stage !== previous.stage && previous.status === 'running') {
    next.stepStates[previous.stage] = 'done';
  }
  if (event.status === 'complete') {
    if (previous?.stage) next.stepStates[previous.stage] = 'done';
  } else if (event.stage) {
    next.stepStates[event.stage] = ['failed', 'cancelled'].includes(next.status) ? 'stopped' : 'active';
  } else if (['failed', 'cancelled'].includes(next.status) && next.stage) {
    next.stepStates[next.stage] = 'stopped';
  }
  if (event.stage !== previous?.stage) { next.percent = null; next.current = null; next.total = null; }
  if (Number.isFinite(event.percent)) next.percent = Math.max(0, Math.min(100, event.percent));
  if (Number.isFinite(event.current)) next.current = event.current;
  if (Number.isFinite(event.total)) next.total = event.total;
  return next;
}
