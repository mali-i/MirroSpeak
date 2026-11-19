<template>
  <section class="settings-section ai-settings">
    <h3>AI 个人笔记 · Gemini BYOK</h3>
    <p>使用你自己的 Gemini API Key，费用由服务商向你的 API 账户收取。仅在你主动分析时，将完整视频、音轨和 Key 发送至你配置的 API 服务，报告保存在本机。</p>
    <button :disabled="busy || !ready" @click="baseUrl = 'https://api.teamorouter.com'">使用 TeamoRouter 地址</button>
    <label>API Base URL<input v-model="baseUrl" :disabled="busy || !ready" placeholder="https://generativelanguage.googleapis.com" autocomplete="off" /></label>
    <p class="hint">填写 Gemini 原生 API 服务根地址，可带路径前缀或以 /v1beta 结尾。TeamoRouter 使用 https://api.teamorouter.com，认证自动采用 Bearer。视频分析仍要求中转站支持 Files API 和 generateContent；仅兼容 OpenAI Chat API 的地址暂不适用。更换地址时请重新填写对应 Key。</p>
    <label>模型名称<input v-model="model" :disabled="busy || !ready" placeholder="gemini-3.8-flash" autocomplete="off" /></label>
    <label>API Key<input v-model="apiKey" :disabled="busy || !ready" type="password" :placeholder="hasKey ? '已安全保存；留空保留当前 Key' : '输入 Gemini API Key'" autocomplete="off" /></label>
    <p v-if="secureStorage === false">系统安全存储不可用，暂不能保存 Key。</p>
    <p v-if="loading">正在连接 AI 服务并检查安全存储…</p>
    <div class="actions">
      <button v-if="!ready" :disabled="busy" @click="loadSettings">重试连接</button>
      <button :disabled="busy || !ready || secureStorage !== true" @click="save">保存配置</button>
      <button :disabled="busy || !ready || !hasKey" @click="test">测试基础连接</button>
      <button :disabled="busy || !ready || !hasKey" @click="forget">删除 Key</button>
    </div>
    <p class="hint">基础连接测试仅验证 Key 与模型查询，不调用模型生成、不上传测试视频。</p>
    <p role="status">{{ message }}</p>
    <p class="hint">视频上限 15 分钟 / 2 GB。上传后尝试删除远端临时文件；清理失败可通过测试连接重试。Gemini 的可用地区与数据政策以服务商为准。</p>
  </section>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { invokeAI } from '../ai/client.mjs';
const baseUrl = ref('https://generativelanguage.googleapis.com');
const model = ref('gemini-3.8-flash'), apiKey = ref(''), hasKey = ref(false), secureStorage = ref(null), busy = ref(false), message = ref('');
const ready = ref(false), loading = ref(true);
async function run(action, data) {
  busy.value = true;
  try { return await invokeAI(window.electronAPI, action, data); }
  finally { busy.value = false; }
}
async function save() { try { const settings = await run('configure', { baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value }); baseUrl.value = settings.baseUrl; hasKey.value = settings.hasKey; apiKey.value = ''; message.value = '配置已保存。'; } catch (e) { message.value = e.message; } }
async function test() { try { message.value = '正在验证 Key 和模型查询，不发送视频…'; message.value = (await run('test')).message; } catch (e) { message.value = e.message; } }
async function forget() { try { await run('forget-key'); hasKey.value = false; message.value = 'Key 已删除，本地报告保留。'; } catch (e) { message.value = e.message; } }
async function loadSettings() {
  loading.value = true;
  ready.value = false;
  secureStorage.value = null;
  message.value = '';
  try {
    const settings = await run('settings');
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
.ai-settings { margin-top: 24px; } p { line-height: 1.7; color: #64748b; } label { display: block; margin: 16px 0; font-weight: 600; } input { display: block; width: 100%; padding: 10px; margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 6px; } .actions { display: flex; flex-wrap: wrap; gap: 8px; } button { padding: 9px 14px; border: 0; border-radius: 6px; background: #e2eee8; cursor: pointer; } button:disabled { opacity: .5; } .hint { font-size: 12px; }
</style>
