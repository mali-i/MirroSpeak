<template>
  <div class="notes-overlay" @click.self="close">
    <section class="notes-dialog" aria-label="视频与个人笔记" role="dialog" aria-modal="true">
      <button class="close-button" aria-label="关闭" title="关闭" @click="close">×</button>
      <div class="workspace">
        <div class="player-pane">
          <div class="video-title" :title="record?.name || video.name">{{ record?.name || video.name || '个人笔记' }}</div>
          <video v-if="source && !record?.missing" :key="source" ref="player" :src="source" controls autoplay playsinline @timeupdate="playbackUpdate" @seeking="annotationsPanel?.resetPlayback()" @seeked="playbackUpdate" @play="playbackUpdate" @loadedmetadata="loaded" @error="mediaError" />
          <div v-else-if="record?.missing" class="missing video-missing">
            <strong>原视频未找到</strong>
            <p>已有笔记和批注仍可查看，选择原文件即可恢复播放。</p>
            <button class="relink-recovery" :disabled="busy" @click="relink">重新定位原视频</button>
          </div>
          <VideoAnnotations ref="annotationsPanel" :record="record" :current-time="currentTime" :duration="duration" :missing="!!record?.missing" @pause="player?.pause()" @seek="seekAnnotation" @change="record.annotations = $event">
            <template #tools>
            <button v-if="record && !record.missing" class="relink-button" :disabled="busy" title="视频移动或改名后，可选择原文件恢复关联；已有笔记和批注会保留。" @click="relink">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v2" /><path d="M3 7h14a2 2 0 0 1 2 2v1M3 7v12a2 2 0 0 0 2 2h6" /><circle cx="17" cy="16" r="4" /><path d="m20 19 2 2" /></svg>
              重新定位
            </button>
            </template>
          </VideoAnnotations>
          <section class="ai-compose" aria-label="AI 视频笔记">
            <div class="ai-compose-heading">
              <div class="ai-title-group"><strong>AI 视频笔记</strong><span v-if="previewPlan" class="model-name">{{ previewPlan.model }}</span></div>
              <span class="ai-output-hint">内容梳理 · 素材提炼</span>
            </div>
            <p v-if="!previewPlan || !savedAISettings?.hasKey" class="setup-hint" role="status">{{ settingsError || '请先在设置中配置模型和 API Key。' }}</p>
            <details class="ai-options advanced-options">
              <summary>选项与说明<span v-if="videoUrl.trim()" class="option-state">使用视频链接</span></summary>
              <div class="option-content">
                <label for="analysis-video-url" class="url-label">原视频链接 <span class="optional">可选</span></label>
                <input id="analysis-video-url" v-model="videoUrl" type="url" :disabled="busy" placeholder="https://…" />
                <p>填写与当前视频一致、包含音轨的有效公网链接，模型将直接读取原视频。</p>
              </div>
            <details class="ai-options processing-details">
              <summary>处理与费用说明</summary>
              <div class="option-content">
                <p>视频及音轨将发送至阿里云百炼，费用计入你的账户。笔记与编辑保存在本机。</p>
                <p>本地视频较大时会压缩副本，保留完整时长，可能损失画面和声音细节。支持最长 15 分钟、最大 2 GB，原片保持不变。</p>
                <p v-if="previewPlan">本次方式：{{ previewPlan.method }}</p>
                <p class="endpoint">服务地址：{{ endpoint }}</p>
              </div>
            </details>
            </details>
            <div class="ai-compose-footer">
              <label class="analysis-consent"><input v-model="consent" type="checkbox" :disabled="busy" /><span>同意发送视频及音轨至百炼分析，可能产生费用</span></label>
              <div class="analysis-actions">
                <button v-if="busy" class="cancel-analysis" :disabled="cancelRequested" @click="cancel">{{ cancelRequested ? '正在取消…' : '取消' }}</button>
                <button class="generate-notes" :disabled="busy || loading || !previewPlan || !savedAISettings?.hasKey || !consent || !duration || record?.missing" @click="analyze">{{ busy ? '分析中…' : report ? '重新生成' : '生成笔记' }}</button>
              </div>
              <small v-if="report" class="version-hint">重新生成会保留现有笔记，新增一个版本。</small>
            </div>
          </section>
          <AnalysisProgress v-if="task" :task="task" />
          <p role="status">{{ status }}</p><p v-if="error" role="alert" class="error">{{ error }}</p>
          <div v-if="recoverable" class="consent"><strong>已有模型响应保存在本机</strong><p>可先重新解析，不上传视频、不发起新的模型调用。若响应本身缺失或截断，仍需重新分析。</p><button :disabled="busy || recovering" @click="recover">{{ recovering ? '正在重新解析…' : '重新解析已有响应' }}</button></div>
        </div>
        <div class="report-pane">
          <p v-if="loading">正在校验视频身份并加载报告…</p>
          <template v-if="report">
            <div class="toolbar">
              <select :value="version" :disabled="busy || editing" @change="version = $event.target.value">
                <option v-for="item in record.reports.filter(item => item.schemaVersion === 2)" :key="item.id" :value="item.id">{{ new Date(item.createdAt).toLocaleString() }}{{ item.editedAt ? ' · 已编辑' : '' }}</option>
              </select>
              <button :disabled="busy || editing" @click="edit">编辑笔记</button>
              <button :disabled="editing" @click="exportNotes">导出 Markdown</button>
            </div>
            <h2>{{ report.title }}</h2><p class="prose">{{ report.summary }}</p>
            <small>{{ report.model }} · {{ report.inputMode === 'inline' ? (report.compressed ? '压缩视频 · ' : '本地原视频 · ') : (report.inputMode === 'url' ? '原视频链接 · ' : '') }} 时间点由模型生成，请回看核实。图片来自原视频，正文为整理文字。</small>
            <h3>主题导航</h3>
            <div class="toolbar"><button v-for="(item, index) in report.notes" :key="index" @click="openTopic(index)">{{ item.title }}</button></div>
            <h3>主题笔记</h3>
            <article v-for="(item, index) in report.notes" :key="index" :id="`topic-${index}`">
              <h4>{{ item.title }}</h4><p><strong>{{ item.takeaway }}</strong></p>
              <div class="toolbar"><button v-for="(range, n) in item.sources" :key="n" class="timestamp" :disabled="record.missing" @click="seek(range.startMs)">{{ time(range.startMs) }}–{{ time(range.endMs) }}</button></div>
              <textarea v-if="editing" v-model="draft[index]" rows="6" /><p v-else class="prose">{{ item.text }}</p>
              <button v-if="index < 6 && (!record.missing || report.frames?.[index])" class="frame" :disabled="record.missing" @click="seek(item.sources[0].startMs)">
                <VideoFrame :key="`${report.id}-${index}-${source}`" :src="source" :seconds="item.sources[0].startMs / 1000" :saved="report.frames?.[index]" @capture="saveFrame(index, $event)" />
              </button>
            </article>
            <h3>可复用素材</h3>
            <p v-if="!report.materials.length">暂无可独立复用的素材。</p>
            <article v-for="(item, index) in report.materials" :key="index"><h4>【{{ item.type }}】{{ item.title }}</h4><p class="prose">{{ item.text }}</p><div class="toolbar"><button v-for="(range, n) in item.sources" :key="n" class="timestamp" :disabled="record.missing" @click="seek(range.startMs)">{{ time(range.startMs) }}–{{ time(range.endMs) }}</button></div></article>
            <h3>待确认内容</h3>
            <p v-if="!report.uncertainties.length">模型未标出待确认内容，仍建议回看核实。</p>
            <article v-for="(item, index) in report.uncertainties" :key="index"><h4>{{ item.title }}</h4><p class="prose">{{ item.text }}</p><div class="toolbar"><button v-for="(range, n) in item.sources" :key="n" class="timestamp" :disabled="record.missing" @click="seek(range.startMs)">{{ time(range.startMs) }}–{{ time(range.endMs) }}</button></div></article>
            <div v-if="editing" class="toolbar"><button :disabled="saving" @click="save">保存笔记</button><button :disabled="saving" @click="editing = false">放弃修改</button></div>
          </template>
          <div v-else-if="!loading" class="empty">分析后，这里会出现内容概览、主题笔记、可复用素材和待确认内容。</div>
        </div>
      </div>
    </section>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import VideoFrame from './VideoFrame.vue';
import VideoAnnotations from './VideoAnnotations.vue';
const currentTime = ref(0), annotationsPanel = ref(null);
function playbackUpdate(event) {
  const video = event.target;
  currentTime.value = video.currentTime;
  if (!video.paused && !video.seeking) annotationsPanel.value?.playback(video.currentTime);
}
function seekAnnotation(ms) { if (player.value) { player.value.pause(); player.value.currentTime = ms / 1000; } }
import AnalysisProgress from './AnalysisProgress.vue';
import { savedAISettings, refreshAISettings } from '../ai/settings-state.mjs';
import { applyProgress, createAnalysisPlan } from '../ai/progress.mjs';
const task = ref(null), cancelRequested = ref(false), recoverable = ref(false), recovering = ref(false);
const props = defineProps({ video: { type: Object, required: true } });
const emit = defineEmits(['close', 'updated']);
const record = ref(null), player = ref(null), duration = ref(0), version = ref(''), busy = ref(false), loading = ref(true), consent = ref(false), status = ref(''), error = ref(''), editing = ref(false), saving = ref(false), draft = ref([]);
const endpoint = computed(() => savedAISettings.value?.baseUrl || '未配置百炼 API 地址');
const settingsError = ref('');
const previewPlan = computed(() => {
  try { return savedAISettings.value ? createAnalysisPlan(savedAISettings.value.model, videoUrl.value) : null; }
  catch { return null; }
});
const videoUrl = ref('');
let mounted = true;
const report = computed(() => record.value?.reports.find(item => item.id === version.value));
const source = computed(() => { const filePath = record.value?.path || props.video.path; return filePath ? `media://local${filePath.split('/').map(encodeURIComponent).join('/')}` : ''; });
async function call(action, data) { const result = await window.electronAPI.ai(action, data); if (!result.success) { const error = new Error(result.error); error.recoverable = result.recoverable; throw error; } return result.data; }
function assign(value) { recoverable.value = !!value.pendingAnalysis && value.pendingAnalysis.canReparse !== false && !!value.pendingAnalysis.response?.choices?.[0]?.message?.content?.trim(); record.value = value; version.value = value.reports.filter(item => item.schemaVersion === 2).at(-1)?.id || ''; }
function time(ms) { return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`; }
function loaded(event) { duration.value = Number.isFinite(event.target.duration) ? event.target.duration : 0; }
function mediaError() { error.value = '视频无法播放。可重新定位原视频；已有笔记仍可查看。'; }
function seek(ms) { if (player.value) { player.value.currentTime = ms / 1000; player.value.play().catch(() => {}); } }
function close() { if (busy.value) { error.value = '请先取消任务，等待清理结束后再关闭。'; return; } if (editing.value && !window.confirm('放弃尚未保存的笔记修改？')) return; if (annotationsPanel.value && !annotationsPanel.value.canLeave()) return; emit('close'); }
async function relink() { if (editing.value && !window.confirm('放弃尚未保存的修改并重新定位？')) return; try { const value = await call('relink', { id: record.value.id }); if (value) { editing.value = false; assign(value); duration.value = 0; error.value = ''; emit('updated'); } } catch (e) { error.value = e.message; } }
async function analyze() {
  if (editing.value) { error.value = '请先保存或放弃笔记修改。'; return; }
  busy.value = true; cancelRequested.value = false; error.value = ''; status.value = '';
  task.value = applyProgress(null, { stage: 'validate', status: 'running', startedAt: Date.now(), message: '正在准备分析任务…' });
  try {
    await refreshAISettings(window.electronAPI);
    if (!previewPlan.value) throw new Error('请在设置中选择支持的模型并保存配置。');
    task.value = applyProgress(task.value, { plan: previewPlan.value });
    const value = await call('analyze', { filePath: record.value.path, duration: duration.value, videoUrl: videoUrl.value.trim() }); if (mounted) { assign(value); if (task.value?.status !== 'complete') task.value = applyProgress(task.value, { stage: 'complete', status: 'complete', message: '个人笔记已保存。', finishedAt: Date.now() }); emit('updated'); } }
  catch (e) { if (mounted) { recoverable.value = !!e.recoverable; if (task.value?.status !== 'cancelled') error.value = e.message; if (task.value?.status === 'running') task.value = applyProgress(task.value, { status: 'failed', message: '处理未完成，请查看下方错误。', finishedAt: Date.now() }); status.value = ''; } }
  finally { busy.value = false; consent.value = false; }
}
async function cancel() { cancelRequested.value = true; try { await call('cancel'); if (busy.value && task.value?.status === 'running') task.value = applyProgress(task.value, { message: '正在停止任务并清理临时文件，请稍候…' }); } catch (e) { error.value = e.message; cancelRequested.value = false; } }
async function recover() { recovering.value = true; try { assign(await call('recover', { id: record.value.id })); error.value = ''; task.value = null; status.value = '已从本地响应恢复笔记，未调用模型。'; emit('updated'); } catch (e) { error.value = e.message; } finally { recovering.value = false; } }
function openTopic(index) { document.getElementById(`topic-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function edit() { draft.value = report.value.notes.map(item => item.text); editing.value = true; }
async function save() { saving.value = true; try { const id = version.value; record.value = await call('save', { id: record.value.id, reportId: id, notes: [...draft.value] }); editing.value = false; status.value = '笔记修改已保存。'; } catch (e) { error.value = e.message; } finally { saving.value = false; } }
async function exportNotes() { try { if (await call('export', { id: record.value.id, reportId: version.value })) status.value = 'Markdown 已导出。'; } catch (e) { error.value = e.message; } }
async function saveFrame(index, image) { try { await call('frame', { id: record.value.id, reportId: version.value, index, image }); } catch (e) { error.value = `画面保存失败：${e.message}`; } }
const unsubscribe = window.electronAPI.onAIProgress(update => { if (!busy.value) return; if (typeof update === 'string') task.value = applyProgress(task.value, { message: update }); else task.value = applyProgress(task.value, update); });
onMounted(async () => { try { try { await refreshAISettings(window.electronAPI); settingsError.value = previewPlan.value ? '' : '请在设置中选择支持的模型并保存配置。'; } catch (e) { settingsError.value = e.message; } assign(await call('open', props.video.id ? { id: props.video.id } : { filePath: props.video.path })); } catch (e) { error.value = e.message; } finally { loading.value = false; } });
onBeforeUnmount(() => { mounted = false; unsubscribe(); if (busy.value) window.electronAPI.ai('cancel'); });
</script>
<style scoped>
.notes-overlay { position: fixed; inset: 0; background: #0f172acc; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.notes-dialog { position: relative; background: #fff; border-radius: 14px; width: 1280px; max-width: 100%; height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 90px #0005; }
.video-title { margin-bottom: 10px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 400; line-height: 20px; color: #64748b; } .notes-dialog > .close-button { position: absolute; top: 12px; right: 12px; z-index: 5; flex-shrink: 0; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; background: transparent; color: #64748b; font-size: 22px; line-height: 1; border-radius: 5px; } .notes-dialog > .close-button:hover { background: #f1f5f9; color: #334155; } .notes-dialog > .close-button:focus-visible { outline: 2px solid #25815a; outline-offset: 2px; }
.report-pane > .toolbar:first-child { padding-right: 24px; }
.workspace { display: grid; grid-template-columns: minmax(280px, 44%) minmax(0, 1fr); flex: 1; min-height: 0; }.player-pane, .report-pane { overflow-y: auto; padding: 24px; }.player-pane { background: #f5f7fa; }.player-pane > video { width: 100%; max-height: 45vh; background: #111; border-radius: 8px; }.player-pane p, small { color: #64748b; line-height: 1.7; font-size: 13px; }.consent { padding: 18px; margin-top: 24px; background: #fff; border: 1px solid #dce7e1; border-radius: 10px; }.consent label { display: block; margin: 16px 0; font-size: 14px; }
button, select { padding: 8px 12px; border: 1px solid #d4dfda; border-radius: 6px; background: #edf5ef; color: #24583f; cursor: pointer; }button:disabled { opacity: .45; cursor: default; }.toolbar { display: flex; flex-wrap: wrap; gap: 8px; }select { max-width: 100%; }.prose { white-space: pre-wrap; line-height: 1.85; }h2 { font-size: 24px; }h3 { margin-top: 30px; }h4 { margin: 10px 0; }article { border-bottom: 1px solid #eef2f7; padding: 14px 0; }.timestamp { background: transparent; color: #25815a; border: 0; padding: 0; font-size: 13px; }.frame { display: block; padding: 0; border: 0; width: min(100%, 320px); }textarea { width: 100%; padding: 12px; line-height: 1.8; border: 1px solid #b9d2c4; border-radius: 6px; font: inherit; }.error { color: #b42318 !important; }.empty, .missing { padding: 32px 0; color: #64748b; line-height: 1.8; }.missing button { display: block; margin-top: 12px; }
.ai-compose { margin-top: 24px; padding: 18px 0 0; border-top: 1px solid #dce3df; }
.ai-compose-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; justify-content: space-between; }
.ai-title-group { display: flex; flex-direction: column; gap: 5px; }
.ai-output-hint { color: #94a3b8; font-size: 11px; }
.url-label { display: block; margin-bottom: 8px; color: #64748b; font-size: 12px; }
.ai-compose-heading strong { font-size: 14px; font-weight: 600; color: #334155; }
.model-name { font-size: 11px; color: #7b8796; overflow-wrap: anywhere; }
.ai-compose .ai-description { margin: 6px 0 14px; font-size: 12px; color: #7b8796; }
.ai-compose .setup-hint { font-size: 12px; margin: 0 0 12px; }
.ai-options { border: 0; }
.advanced-options { margin-top: 10px; }
.processing-details { margin-top: 0; }
.ai-options summary { padding: 10px 0; font-size: 12px; color: #64748b; cursor: pointer; }
.optional, .option-state { margin-left: 8px; font-size: 11px; color: #94a3b8; }
.option-state { color: #25815a; }
.option-content { padding: 4px 0 10px; }
.option-content input { box-sizing: border-box; width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid #d4dfda; border-radius: 6px; background: #fbfcfb; color: #334155; font-size: 12px; }
.ai-compose .option-content p { margin: 8px 0 0; font-size: 12px; line-height: 1.7; }
.endpoint { overflow-wrap: anywhere; }
.ai-compose-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding-top: 10px; }
.analysis-consent { flex: 1 1 190px; display: flex; align-items: flex-start; gap: 8px; color: #64748b; font-size: 12px; line-height: 1.7; cursor: pointer; }
.analysis-consent input { margin: 4px 0 0; flex-shrink: 0; accent-color: #24583f; }
.analysis-actions { display: flex; flex: 0 0 auto; margin-left: auto; justify-content: flex-end; gap: 8px; }
.analysis-actions .generate-notes { background: #24583f; border-color: #24583f; color: white; padding: 8px 18px; font-size: 13px; }
.analysis-actions .generate-notes:hover:not(:disabled) { background: #1c4933; }
.analysis-actions .cancel-analysis { background: transparent; color: #64748b; font-size: 13px; }
.ai-compose .version-hint { flex-basis: 100%; display: block; margin-top: 0; text-align: right; font-size: 11px; color: #94a3b8; }
.ai-compose summary:focus-visible, .ai-compose input:focus-visible, .ai-compose button:focus-visible { outline: 2px solid #25815a; outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
button.relink-button { display: inline-flex; align-items: center; gap: 5px; padding: 5px 7px; border: 0; background: transparent; color: #7b8796; font-size: 12px; line-height: 18px; }
button.relink-button:hover:not(:disabled) { color: #24583f; background: #e8eeea; }
.relink-button:focus-visible, .relink-recovery:focus-visible { outline: 2px solid #25815a; outline-offset: 2px; }
.video-missing { padding: 24px; border: 1px dashed #cbd5e1; border-radius: 8px; background: #fff; }
.video-missing strong { color: #475569; font-size: 14px; font-weight: 500; }
.video-missing p { margin: 8px 0 16px; }
.video-missing .relink-recovery { display: inline-flex; margin: 0; font-size: 13px; }
@media(max-width: 800px) { .video-title { padding-right: 28px; } .notes-overlay { padding: 8px; }.report-pane > .toolbar:first-child { padding-right: 24px; }
.workspace { display: block; overflow-y: auto; }.player-pane, .report-pane { overflow: visible; padding: 16px; } }
</style>
