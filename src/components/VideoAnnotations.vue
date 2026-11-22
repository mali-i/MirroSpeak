<template>
  <section class="annotations" aria-label="视频批注">
    <div class="annotation-tools">
      <button class="collapse-toggle" :aria-expanded="expanded" @click="expanded = !expanded"><svg :class="{ rotated: expanded }" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 4 4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>批注<span class="count">{{ items.length }}</span></button>
      <div class="tool-actions"><button class="add-button" :disabled="!record || missing || !duration || saving" @click="start()"><span aria-hidden="true">＋</span> 添加</button><span class="tool-divider" aria-hidden="true"></span><slot name="tools" /></div>
    </div>
    <form v-if="draft" class="editor" @submit.prevent="save">
      <fieldset :disabled="saving">
        <div class="editor-heading"><strong>{{ draft.id ? '编辑批注' : '新批注' }}</strong><label class="time-label">时间点<input v-model="timestamp" aria-label="批注时间（分:秒）" class="time-input" placeholder="分:秒" required /></label></div>
        <textarea ref="textInput" v-model="draft.text" rows="3" maxlength="10000" aria-label="批注内容" placeholder="记下补充、更正或你的想法…" />
        <div v-if="draft.links.length" class="reference-editor">
          <div class="field-caption">来源引用 <span>{{ draft.links.length }}</span></div>
          <div v-for="(link, index) in draft.links" :key="index" class="link-editor">
            <span class="link-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <div class="link-fields"><label><span class="sr-only">引用 {{ index + 1 }} 链接地址</span><input v-model="link.url" type="url" required placeholder="粘贴 https:// 链接" /></label><label><span class="sr-only">引用 {{ index + 1 }} 显示名称（选填）</span><input v-model="link.title" maxlength="200" placeholder="显示名称（选填，例如：原微博）" /></label></div>
            <button type="button" class="remove-link" :aria-label="`移除引用 ${index + 1}`" title="移除引用" @click="draft.links.splice(index, 1)">×</button>
          </div>
        </div>
        <div class="editor-footer"><button type="button" class="quiet add-reference" :disabled="draft.links.length >= 20" @click="draft.links.push({ url: '', title: '' })">＋ 引用链接</button><div class="actions"><button type="button" class="quiet" @click="draft = null; error = ''">取消</button><button class="primary">{{ saving ? '保存中…' : '保存批注' }}</button></div></div>
      </fieldset>
    </form>
    <p v-if="expanded && !items.length && !draft" class="hint">在当前时间点补充想法、更正或来源链接。</p>
    <article v-for="item in visibleItems" :key="item.id" :class="{ 'playback-active': activeIds.has(item.id), 'being-edited': draft?.id === item.id }">
      <button class="timestamp" :disabled="missing" @click="$emit('seek', item.timeMs)">{{ time(item.timeMs) }}</button>
      <div class="annotation-content">
        <p v-if="item.text" class="body">{{ item.text }}</p>
        <div v-if="item.links.length" class="references"><a v-for="(link, index) in item.links" :key="index" :href="link.url" :title="link.url" @click.prevent="openLink(link.url)"><span class="reference-icon" aria-hidden="true">↗</span><span>{{ link.title || hostname(link.url) }}<span v-if="link.title" class="reference-domain">{{ hostname(link.url) }}</span></span></a></div>
        <div class="entry-footer"><small :title="`添加于 ${date(item.createdAt)}${item.updatedAt !== item.createdAt ? ' · 编辑于 ' + date(item.updatedAt) : ''}`">{{ new Date(item.createdAt).toLocaleDateString() }}{{ item.updatedAt !== item.createdAt ? ' · 已编辑' : '' }}</small><div class="entry-actions"><button :disabled="saving" @click="start(item)">编辑</button><button :disabled="saving" class="delete-action" @click="remove(item)">删除</button></div></div>
      </div>
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
.annotations { margin-top: 6px; color: #334155; }
button, input, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .4; cursor: default; }
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #25815a; outline-offset: 3px; }
.annotation-tools { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 34px; }
.collapse-toggle, .add-button, .quiet, .entry-actions button, .remove-link { border: 0; background: transparent; color: #64748b; }
.collapse-toggle { display: inline-flex; align-items: center; gap: 7px; padding: 8px 0; font-size: 12px; }
.collapse-toggle svg { transition: transform .15s ease; }
.collapse-toggle svg.rotated { transform: rotate(90deg); }
.count { color: #94a3b8; font-size: 11px; font-variant-numeric: tabular-nums; }
.tool-actions { display: flex; align-items: center; gap: 10px; }
.add-button { padding: 6px 2px; font-size: 12px; }
.tool-divider { width: 1px; height: 12px; background: #dce3df; }
.collapse-toggle:hover, .add-button:hover:not(:disabled), .quiet:hover:not(:disabled) { color: #24583f; }
article { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 14px; padding: 12px 0; border-top: 1px solid #e8ece9; }
.timestamp { align-self: start; padding: 1px 0; border: 0; background: transparent; text-align: left; color: #7b8796; font-size: 12px; line-height: 24px; font-variant-numeric: tabular-nums; }
.timestamp:hover:not(:disabled), .playback-active .timestamp { color: #25815a; }
.playback-active { border-top-color: #afc9ba; }
.being-edited { opacity: .55; }
.annotation-content { min-width: 0; }
.body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.85; color: #64748b; }
.references { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 10px; }
.references a { display: inline-flex; align-items: baseline; gap: 7px; color: #356e50; font-size: 12px; line-height: 1.7; text-decoration: none; overflow-wrap: anywhere; max-width: 100%; }
.references a:hover { text-decoration: underline; text-underline-offset: 3px; }
.reference-icon { color: #8ba595; flex-shrink: 0; }
.reference-domain { margin-left: 8px; font-size: 10px; color: #94a3b8; }
.entry-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; }
.entry-footer small { font-size: 10px; color: #94a3b8; line-height: 24px; }
.entry-actions { display: flex; gap: 12px; }
.entry-actions button { padding: 3px 0; font-size: 11px; line-height: 18px; color: #94a3b8; }
.entry-actions button:hover:not(:disabled) { color: #24583f; }
.entry-actions .delete-action:hover:not(:disabled) { color: #b42318; }
.editor { margin: 4px 0 14px; padding: 14px 0 0; border-top: 1px solid #cbd9d0; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.editor-heading strong { font-size: 12px; font-weight: 500; color: #475569; }
.time-label { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #94a3b8; }
input, textarea { box-sizing: border-box; min-width: 0; width: 100%; color: #334155; border: 1px solid #dce3df; border-radius: 5px; background: #ffffff80; font-size: 12px; }
input { padding: 8px 9px; }
input::placeholder, textarea::placeholder { color: #9aa5b1; }
.time-input { width: 72px; padding: 5px 8px; text-align: center; font-variant-numeric: tabular-nums; background: transparent; }
textarea { display: block; padding: 10px 12px; resize: vertical; min-height: 88px; line-height: 1.85; font-size: 13px; }
.reference-editor { margin-top: 14px; }
.field-caption { font-size: 11px; color: #64748b; margin-bottom: 8px; }
.field-caption span { margin-left: 5px; color: #94a3b8; }
.link-editor { display: grid; grid-template-columns: 18px minmax(0, 1fr) 24px; gap: 8px; align-items: start; margin-top: 10px; }
.link-number { color: #94a3b8; font-size: 10px; padding-top: 9px; font-variant-numeric: tabular-nums; }
.link-fields { display: grid; gap: 5px; }
.link-fields input { background: transparent; }
.remove-link { padding: 4px; font-size: 18px; color: #94a3b8; }
.remove-link:hover { color: #b42318; }
.editor-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.quiet { padding: 6px 0; font-size: 12px; }
.actions { display: flex; gap: 16px; margin-left: auto; }
.primary { border: 1px solid #b9cdbf; border-radius: 5px; background: transparent; color: #356e50; padding: 7px 12px; font-size: 12px; }
.primary:hover:not(:disabled) { background: #e8efe9; border-color: #8ba595; }
.hint { font-size: 12px; line-height: 1.8; margin: 8px 0 16px; color: #94a3b8; }
.undo { display: flex; align-items: center; gap: 12px; padding: 10px 0; font-size: 12px; color: #64748b; }
.undo button { border: 0; background: transparent; color: #25815a; font-size: 12px; padding: 4px; }
.error { color: #b42318; font-size: 12px; line-height: 1.7; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (prefers-reduced-motion: reduce) { .collapse-toggle svg { transition: none; } }
</style>
