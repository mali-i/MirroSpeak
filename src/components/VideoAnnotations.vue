<template>
  <section class="annotations" aria-label="视频批注">
    <div class="heading"><button class="collapse-toggle" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '▾' : '▸' }} 批注 <span>· {{ items.length }}</span></button><button :disabled="!record || missing || !duration || saving" @click="start()">＋ 添加批注</button></div>
    <form v-if="draft" class="editor" @submit.prevent="save">
      <div class="heading"><strong>{{ draft.id ? '编辑批注' : '添加批注' }}</strong><label>时间 <input v-model="timestamp" aria-label="批注时间（分:秒）" class="time-input" placeholder="分:秒" required /></label></div>
      <textarea ref="textInput" v-model="draft.text" rows="4" maxlength="10000" aria-label="批注内容" placeholder="补充想法、更正或来源…" />
      <div v-for="(link, index) in draft.links" :key="index" class="link-editor">
        <label>链接地址<input v-model="link.url" type="url" required placeholder="https://…" /></label>
        <label>显示名称（选填）<input v-model="link.title" maxlength="200" placeholder="例如：原微博" /></label>
        <button type="button" class="quiet" @click="draft.links.splice(index, 1)">移除引用</button>
      </div>
      <button type="button" class="quiet" :disabled="draft.links.length >= 20" @click="draft.links.push({ url: '', title: '' })">＋ 添加引用链接</button>
      <div class="actions"><button type="button" :disabled="saving" @click="draft = null">取消</button><button class="primary" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button></div>
    </form>
    <p v-if="!items.length && !draft" class="hint">在当前时间点补充想法、更正或来源链接。</p>
    <article v-for="item in visibleItems" :key="item.id">
      <div class="heading"><button class="timestamp" :disabled="missing" @click="$emit('seek', item.timeMs)">{{ time(item.timeMs) }}</button><details><summary aria-label="批注操作">···</summary><div class="menu"><button :disabled="saving" @click="start(item)">编辑</button><button :disabled="saving" @click="remove(item)">删除</button></div></details></div>
      <p v-if="item.text" class="body">{{ item.text }}</p>
      <a v-for="(link, index) in item.links" :key="index" :href="link.url" :title="link.url" @click.prevent="openLink(link.url)">↗ {{ link.title || hostname(link.url) }}</a>
      <small :title="`添加于 ${date(item.createdAt)}`">{{ item.updatedAt !== item.createdAt ? '编辑于' : '添加于' }} {{ date(item.updatedAt) }}</small>
    </article>
    <div v-if="deleted" class="undo" role="status">批注已删除 <button :disabled="saving" @click="undo">撤销</button></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p class="sr-only" aria-live="polite">{{ status }}</p>
  </section>
</template>
<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue';
import { validateAnnotation } from '../ai/annotations.mjs';
const props = defineProps({ record: Object, currentTime: Number, duration: Number, missing: Boolean });
const emit = defineEmits(['change', 'pause', 'seek']);
const draft = ref(null), timestamp = ref(''), saving = ref(false), error = ref(''), status = ref(''), deleted = ref(null), textInput = ref(null);
const expanded = ref(false), activeIds = ref(new Set());
const displayTimers = new Map();
let undoTimer, previousTime = null;
const visibleItems = computed(() => expanded.value ? items.value : items.value.filter(item => activeIds.value.has(item.id)));
function resetPlayback() {
  previousTime = null;
  for (const timer of displayTimers.values()) clearTimeout(timer);
  displayTimers.clear(); activeIds.value = new Set();
}
function playback(time) {
  const current = time * 1000;
  const from = previousTime === null ? Math.floor(time) * 1000 - 1 : previousTime;
  previousTime = current;
  if (current < from) return;
  for (const item of items.value) {
    if (item.timeMs > from && item.timeMs <= current) {
      activeIds.value = new Set([...activeIds.value, item.id]);
      clearTimeout(displayTimers.get(item.id));
      displayTimers.set(item.id, setTimeout(() => {
        const next = new Set(activeIds.value); next.delete(item.id); activeIds.value = next;
        displayTimers.delete(item.id);
      }, 5000));
    }
  }
}
const items = computed(() => [...(props.record?.annotations || [])].sort((a, b) => a.timeMs - b.timeMs || a.createdAt.localeCompare(b.createdAt)));
function time(ms) { const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function date(value) { return new Date(value).toLocaleString(); }
function hostname(url) { try { return new URL(url).hostname; } catch { return url; } }
function canLeave() { return !saving.value && (!draft.value || window.confirm('放弃尚未保存的批注？')); }
defineExpose({ canLeave, playback, resetPlayback });
async function start(item) {
  if (!canLeave()) return;
  emit('pause'); error.value = '';
  draft.value = item ? JSON.parse(JSON.stringify(item)) : { text: '', links: [], timeMs: Math.floor((props.currentTime || 0) * 1000) };
  timestamp.value = time(draft.value.timeMs);
  await nextTick(); textInput.value?.focus();
}
async function call(action, data) {
  const result = await window.electronAPI.ai(action, data);
  if (!result.success) throw new Error(result.error);
  return result.data;
}
async function save() {
  error.value = '';
  try {
    const match = /^(\d+):([0-5]\d)$/.exec(timestamp.value.trim());
    if (!match) throw new Error('时间请使用 分:秒 格式，例如 02:34。');
    const timeMs = (Number(match[1]) * 60 + Number(match[2])) * 1000;
    if (props.duration && timeMs > props.duration * 1000) throw new Error('批注时间不能超过视频时长。');
    const annotation = { ...validateAnnotation({ ...draft.value, timeMs }), id: draft.value.id };
    saving.value = true;
    emit('change', await call('annotation-save', { id: props.record.id, annotation }));
    draft.value = null; status.value = '批注已保存。';
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}
async function remove(item) {
  saving.value = true; error.value = '';
  try {
    emit('change', await call('annotation-delete', { id: props.record.id, annotationId: item.id }));
    if (draft.value?.id === item.id) draft.value = null;
    deleted.value = item; clearTimeout(undoTimer); undoTimer = setTimeout(() => { deleted.value = null; }, 10000);
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}
async function undo() {
  saving.value = true; error.value = ''; clearTimeout(undoTimer);
  try { emit('change', await call('annotation-save', { id: props.record.id, annotation: deleted.value })); deleted.value = null; }
  catch (e) { error.value = e.message; } finally { saving.value = false; }
}
async function openLink(url) { try { await call('annotation-link', { url }); } catch (e) { error.value = e.message; } }
onBeforeUnmount(() => { clearTimeout(undoTimer); resetPlayback(); });
</script>
<style scoped>
.annotations { margin-top: 18px; padding: 18px; background: white; border: 1px solid #dce7e1; border-radius: 10px; color: #243b30; }
.collapse-toggle { background: transparent; border: 0; padding: 0; font-weight: 600; font-size: 15px; }
.heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }h3 { font-size: 15px; margin: 0; }h3 span, .hint, small { color: #718078; }button { cursor: pointer; padding: 7px 10px; border: 1px solid #d4dfda; border-radius: 6px; background: #edf5ef; color: #24583f; font: inherit; font-size: 13px; }button:disabled { opacity: .45; cursor: default; }.quiet, .timestamp { background: transparent; border: 0; padding-left: 0; }.timestamp { font-variant-numeric: tabular-nums; }.primary { background: #24583f; color: white; }.editor { margin-top: 16px; padding-top: 16px; border-top: 1px solid #e7ede9; }.editor label { font-size: 12px; color: #64748b; }input, textarea { box-sizing: border-box; width: 100%; border: 1px solid #cbd9d0; border-radius: 6px; padding: 9px; font: inherit; color: #243b30; background: white; }textarea { margin: 12px 0 6px; resize: vertical; line-height: 1.7; }.time-input { width: 78px; margin-left: 6px; }.link-editor { display: grid; gap: 8px; padding: 12px; background: #f5f8f6; border-radius: 6px; margin: 8px 0; }.link-editor input { display: block; margin-top: 4px; }.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }article { padding: 16px 0; border-bottom: 1px solid #edf1ee; }.body { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.8; margin: 8px 0; }a { display: block; color: #25815a; font-size: 13px; margin: 6px 0; overflow-wrap: anywhere; }small { display: block; font-size: 11px; margin-top: 8px; }.hint { font-size: 13px; line-height: 1.8; }details { position: relative; }summary { cursor: pointer; list-style: none; padding: 0 8px; }summary::-webkit-details-marker { display: none; }.menu { position: absolute; right: 0; z-index: 2; padding: 6px; display: flex; gap: 4px; background: white; border: 1px solid #dce7e1; border-radius: 6px; box-shadow: 0 4px 14px #0001; }.undo { font-size: 13px; padding-top: 12px; }.error { color: #b42318; font-size: 13px; }.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
