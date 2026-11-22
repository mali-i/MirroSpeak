// Capabilities for the Bailian OpenAI-compatible Chat Completions interface.
export const MODEL_OPTIONS = Object.freeze([
  { id: 'qwen3.8-omni-flash', label: 'Qwen3.8-Omni-Flash（直接理解音画）', videoAudio: true, jsonOutput: true },
  { id: 'qwen3.5-omni-plus', label: 'Qwen3.5-Omni-Plus（直接理解音画）', videoAudio: true },
  { id: 'qwen3.5-omni-flash', label: 'Qwen3.5-Omni-Flash（直接理解音画）', videoAudio: true },
].map(Object.freeze));

export function getModelProfile(id) {
  const profile = MODEL_OPTIONS.find(item => item.id === id);
  if (!profile) throw new Error('此模型不在支持列表中，请在设置中重新选择模型并保存配置。');
  return profile;
}
