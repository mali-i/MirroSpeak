import { shallowRef } from 'vue';
import { invokeAI } from './client.mjs';

// Only public settings belong in renderer state; never retain API keys here.
export const savedAISettings = shallowRef(null);
export function publishAISettings(settings) {
  savedAISettings.value = { baseUrl: settings.baseUrl, model: settings.model, hasKey: settings.hasKey };
}
export async function refreshAISettings(bridge) {
  const settings = await invokeAI(bridge, 'settings');
  publishAISettings(settings);
  return settings;
}
