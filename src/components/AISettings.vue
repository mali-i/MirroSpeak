<template>
  <section class="settings-section ai-settings">
    <h3>AI 个人笔记 · Qwen-Omni BYOK</h3>
    <p>使用自己的阿里云百炼 API Key，由阿里云按调用量计费。仅在主动分析时提交视频与音轨，笔记保存在本机。</p>
    <label>API Base URL<input v-model="baseUrl" :disabled="busy || !ready" placeholder="https://你的工作空间ID.cn-beijing.maas.aliyuncs.com/compatible-mode/v1" autocomplete="off" /></label>
    <p class="hint">从百炼控制台复制完整 OpenAI 兼容地址（以 /compatible-mode/v1 结尾），Key、地址和模型必须属于同一地域。更换地址时需重新填写 Key。</p>
    <label>模型<select v-model="model" :disabled="busy || !ready">
      <option v-if="!selectedProfile" :value="model" disabled>{{ model }}（请重新选择支持的模型）</option>
      <option v-for="option in MODEL_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option>
    </select></label>
    <p v-if="selectedProfile" class="hint">直接将带音轨的视频提交给模型，综合理解画面与声音。</p>
    <p v-else role="alert">此前保存的模型不在当前支持列表中，请重新选择并保存配置。</p>
    <label>API Key<input v-model="apiKey" :disabled="busy || !ready" type="password" :placeholder="hasKey ? '已安全保存；留空保留当前 Key' : '输入阿里云百炼 API Key'" autocomplete="off" /></label>
    <p class="hint">本地视频超过 6 MiB 时使用 ffmpeg 压缩临时副本，保留完整时长，降低画面清晰度、帧率和音频码率，原片不变。视频页也可填写同一原视频的 HTTPS 公网链接，以保留原始素材质量。</p>
    <p v-if="secureStorage === false">系统安全存储不可用，暂不能保存 Key。</p>
    <p v-if="loading">正在连接 AI 服务并检查安全存储…</p>
    <div class="actions">
      <button v-if="!ready" :disabled="busy" @click="loadSettings">重试连接</button>
      <button :disabled="busy || !ready || !selectedProfile || secureStorage !== true" @click="save">保存配置</button>
      <button :disabled="busy || !ready || !hasKey" @click="test">测试基础连接</button>
      <button :disabled="busy || !ready || !hasKey" @click="forget">删除 Key</button>
    </div>
    <p class="hint">修改模型后需点击“保存配置”，视频分析使用已保存的模型。基础连接测试仅验证 Key 与模型目录，不生成内容、不发送视频。请先保存配置，再测试连接。</p>
    <p role="status">{{ message }}</p>
    <p class="hint">视频上限 15 分钟 / 2 GB。本地临时副本在任务结束后删除；公网链接的文件由你在对象存储中管理。</p>
  </section>
</template>
<script setup>
import { computed, ref, onMounted } from 'vue';
import { invokeAI } from '../ai/client.mjs';
import { MODEL_OPTIONS } from '../ai/models.mjs';
import { publishAISettings } from '../ai/settings-state.mjs';
import { DEFAULT_MODEL } from '../ai/endpoint.mjs';
const baseUrl = ref('');
const model = ref(DEFAULT_MODEL), apiKey = ref(''), hasKey = ref(false), secureStorage = ref(null), busy = ref(false), message = ref('');
const selectedProfile = computed(() => MODEL_OPTIONS.find(option => option.id === model.value));
const ready = ref(false), loading = ref(true);
async function run(action, data) {
  busy.value = true;
  try { return await invokeAI(window.electronAPI, action, data); }
  finally { busy.value = false; }
}
async function save() { try { const settings = await run('configure', { baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value }); publishAISettings(settings); model.value = settings.model; baseUrl.value = settings.baseUrl; hasKey.value = settings.hasKey; apiKey.value = ''; message.value = '配置已保存。'; } catch (e) { message.value = e.message; } }
async function test() { try { message.value = '正在验证 Key 和模型查询，不发送视频…'; message.value = (await run('test')).message; } catch (e) { message.value = e.message; } }
async function forget() { try { await run('forget-key'); hasKey.value = false; publishAISettings(await run('settings')); message.value = 'Key 已删除，本地报告保留。'; } catch (e) { message.value = e.message; } }
async function loadSettings() {
  loading.value = true;
  ready.value = false;
  secureStorage.value = null;
  message.value = '';
  try {
    const settings = await run('settings');
    publishAISettings(settings);
    baseUrl.value = settings.baseUrl;
    model.value = settings.model;
    hasKey.value = settings.hasKey;
    secureStorage.value = settings.secureStorage;
    ready.value = true;
  } catch (e) { message.value = e.message; }
  finally { loading.value = false; }
}
onMounted(loadSettings);
</script>
<style scoped>
.ai-settings { margin-top: 24px; } p { line-height: 1.7; color: #64748b; } label { display: block; margin: 16px 0; font-weight: 600; } input, select { display: block; width: 100%; padding: 10px; margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 6px; } .actions { display: flex; flex-wrap: wrap; gap: 8px; } button { padding: 9px 14px; border: 0; border-radius: 6px; background: #e2eee8; cursor: pointer; } button:disabled { opacity: .5; } .hint { font-size: 12px; }
</style>
