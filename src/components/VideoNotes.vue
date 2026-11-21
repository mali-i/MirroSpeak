<template>
  <div class="notes-overlay" @click.self="close">
    <section class="notes-dialog" aria-label="视频与个人笔记" role="dialog" aria-modal="true">
      <header><strong>{{ record?.name || video.name || '个人笔记' }}</strong><button @click="close">关闭</button></header>
      <div class="workspace">
        <div class="player-pane">
          <video v-if="source && !record?.missing" :key="source" ref="player" :src="source" controls autoplay playsinline @loadedmetadata="loaded" @error="mediaError" />
          <div v-else class="missing">原视频未找到，笔记仍可查看。<button :disabled="busy" @click="relink">重新定位原视频</button></div>
          <p>文件名和路径变化不会改变内容身份。重新定位会校验完整文件指纹。</p>
          <button v-if="record" :disabled="busy" @click="relink">重新定位</button>
          <div class="consent">
            <strong>生成忠实梳理的个人笔记</strong>
            <p>将视频及音轨发送至 {{ endpoint }}，使用设置中已保存的 Key 和模型，可能产生费用。本地视频超过 6 MiB 时使用 ffmpeg 压缩副本（最大 320 像素、每秒 2 帧，音频压缩为单声道，保留完整时长），原片不变。结果和编辑保存在本机。首版上限 15 分钟 / 2 GB。</p>
            <label>原视频公网链接（可选）<input v-model="videoUrl" type="url" :disabled="busy" placeholder="https://…（如 OSS 签名链接）" /></label>
            <p>填写链接时，阿里云直接读取链接中的原视频，不压缩本地文件。请确保链接指向当前播放的同一视频、包含音轨，且在分析期间有效；时间点仍与本地原视频关联。</p>
            <label><input v-model="consent" type="checkbox" :disabled="busy" /> 我同意本次上传和分析</label>
            <button :disabled="busy || loading || !consent || !duration || record?.missing" @click="analyze">{{ report ? '重新分析（新增版本）' : '生成个人笔记' }}</button>
            <button v-if="busy" :disabled="cancelRequested" @click="cancel">{{ cancelRequested ? '正在取消…' : '取消任务' }}</button>
          </div>
          <AnalysisProgress v-if="task" :task="task" />
          <p role="status">{{ status }}</p><p v-if="error" role="alert" class="error">{{ error }}</p>
          <div v-if="recoverable" class="consent"><strong>已有模型响应保存在本机</strong><p>可先重新解析，不上传视频、不发起新的模型调用。若响应本身缺失或截断，仍需重新分析。</p><button :disabled="busy || recovering" @click="recover">{{ recovering ? '正在重新解析…' : '重新解析已有响应' }}</button></div>
        </div>
        <div class="report-pane">
          <p v-if="loading">正在校验视频身份并加载报告…</p>
          <template v-if="report">
            <div class="toolbar">
              <select :value="version" :disabled="busy || editing" @change="version = $event.target.value">
                <option v-for="item in record.reports" :key="item.id" :value="item.id">{{ new Date(item.createdAt).toLocaleString() }}{{ item.editedAt ? ' · 已编辑' : '' }}</option>
              </select>
              <button :disabled="busy || editing" @click="edit">编辑笔记</button>
              <button :disabled="editing" @click="exportNotes">导出 Markdown</button>
            </div>
            <h2>{{ report.title }}</h2><p class="prose">{{ report.summary }}</p>
            <small>{{ report.model }} · {{ report.inputMode === 'inline' ? (report.compressed ? '压缩视频 · ' : '本地原视频 · ') : (report.inputMode === 'url' ? '原视频链接 · ' : '') }} 时间点由模型生成，请回看核实。图片来自原视频，正文为整理文字。</small>
            <h3>章节</h3>
            <article v-for="(item, index) in report.chapters" :key="index">
              <button class="timestamp" :disabled="record.missing" @click="seek(item.startMs)">{{ time(item.startMs) }}–{{ time(item.endMs) }}</button>
              <h4>{{ item.title }}</h4><p class="prose">{{ item.text }}</p>
              <button v-if="index < 6 && (!record.missing || report.frames?.[index])" class="frame" :disabled="record.missing" @click="seek(item.startMs)">
                <VideoFrame :key="`${report.id}-${index}-${source}`" :src="source" :seconds="item.startMs / 1000" :saved="report.frames?.[index]" @capture="saveFrame(index, $event)" />
              </button>
            </article>
            <h3>观点与素材</h3>
            <article v-for="(item, index) in report.materials" :key="index"><button class="timestamp" :disabled="record.missing" @click="seek(item.startMs)">{{ time(item.startMs) }}</button><h4>{{ item.title }}</h4><p class="prose">{{ item.text }}</p></article>
            <h3>个人笔记</h3>
            <article v-for="(item, index) in report.notes" :key="index"><button class="timestamp" :disabled="record.missing" @click="seek(item.startMs)">{{ time(item.startMs) }}</button><h4>{{ item.title }}</h4><textarea v-if="editing" v-model="draft[index]" rows="6" /><p v-else class="prose">{{ item.text }}</p></article>
            <div v-if="editing" class="toolbar"><button :disabled="saving" @click="save">保存笔记</button><button :disabled="saving" @click="editing = false">放弃修改</button></div>
          </template>
          <div v-else-if="!loading" class="empty">分析后，这里会出现内容概览、章节、观点素材和可编辑的个人笔记。</div>
        </div>
      </div>
    </section>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import VideoFrame from './VideoFrame.vue';
import AnalysisProgress from './AnalysisProgress.vue';
import { applyProgress } from '../ai/progress.mjs';
const task = ref(null), cancelRequested = ref(false), recoverable = ref(false), recovering = ref(false);
const props = defineProps({ video: { type: Object, required: true } });
const emit = defineEmits(['close', 'updated']);
const record = ref(null), player = ref(null), duration = ref(0), version = ref(''), busy = ref(false), loading = ref(true), consent = ref(false), status = ref(''), error = ref(''), editing = ref(false), saving = ref(false), draft = ref([]);
const endpoint = ref('设置中配置的阿里云百炼服务');
const videoUrl = ref('');
let mounted = true;
const report = computed(() => record.value?.reports.find(item => item.id === version.value));
const source = computed(() => { const filePath = record.value?.path || props.video.path; return filePath ? `media://local${filePath.split('/').map(encodeURIComponent).join('/')}` : ''; });
async function call(action, data) { const result = await window.electronAPI.ai(action, data); if (!result.success) { const error = new Error(result.error); error.recoverable = result.recoverable; throw error; } return result.data; }
function assign(value) { recoverable.value = !!value.pendingAnalysis && value.pendingAnalysis.canReparse !== false && !!value.pendingAnalysis.response?.choices?.[0]?.message?.content?.trim(); record.value = value; version.value = value.reports.at(-1)?.id || ''; }
function time(ms) { return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`; }
function loaded(event) { duration.value = Number.isFinite(event.target.duration) ? event.target.duration : 0; }
function mediaError() { error.value = '视频无法播放。可重新定位原视频；已有笔记仍可查看。'; }
function seek(ms) { if (player.value) { player.value.currentTime = ms / 1000; player.value.play().catch(() => {}); } }
function close() { if (busy.value) { error.value = '请先取消任务，等待清理结束后再关闭。'; return; } if (editing.value && !window.confirm('放弃尚未保存的笔记修改？')) return; emit('close'); }
async function relink() { if (editing.value && !window.confirm('放弃尚未保存的修改并重新定位？')) return; try { const value = await call('relink', { id: record.value.id }); if (value) { editing.value = false; assign(value); duration.value = 0; error.value = ''; emit('updated'); } } catch (e) { error.value = e.message; } }
async function analyze() {
  if (editing.value) { error.value = '请先保存或放弃笔记修改。'; return; }
  busy.value = true; cancelRequested.value = false; error.value = ''; status.value = '';
  task.value = applyProgress(null, { stage: 'validate', status: 'running', startedAt: Date.now(), message: '正在准备分析任务…' });
  try { const value = await call('analyze', { filePath: record.value.path, duration: duration.value, videoUrl: videoUrl.value.trim() }); if (mounted) { assign(value); if (task.value?.status !== 'complete') task.value = applyProgress(task.value, { stage: 'complete', status: 'complete', message: '个人笔记已保存。', finishedAt: Date.now() }); emit('updated'); } }
  catch (e) { if (mounted) { recoverable.value = !!e.recoverable; if (task.value?.status !== 'cancelled') error.value = e.message; if (task.value?.status === 'running') task.value = applyProgress(task.value, { status: 'failed', message: '处理未完成，请查看下方错误。', finishedAt: Date.now() }); status.value = ''; } }
  finally { busy.value = false; consent.value = false; }
}
async function cancel() { cancelRequested.value = true; try { await call('cancel'); if (busy.value && task.value?.status === 'running') task.value = applyProgress(task.value, { message: '正在停止任务并清理临时文件，请稍候…' }); } catch (e) { error.value = e.message; cancelRequested.value = false; } }
async function recover() { recovering.value = true; try { assign(await call('recover', { id: record.value.id })); error.value = ''; task.value = null; status.value = '已从本地响应恢复笔记，未调用模型。'; emit('updated'); } catch (e) { error.value = e.message; } finally { recovering.value = false; } }
function edit() { draft.value = report.value.notes.map(item => item.text); editing.value = true; }
async function save() { saving.value = true; try { const id = version.value; record.value = await call('save', { id: record.value.id, reportId: id, notes: [...draft.value] }); editing.value = false; status.value = '笔记修改已保存。'; } catch (e) { error.value = e.message; } finally { saving.value = false; } }
async function exportNotes() { try { if (await call('export', { id: record.value.id, reportId: version.value })) status.value = 'Markdown 已导出。'; } catch (e) { error.value = e.message; } }
async function saveFrame(index, image) { try { await call('frame', { id: record.value.id, reportId: version.value, index, image }); } catch (e) { error.value = `画面保存失败：${e.message}`; } }
const unsubscribe = window.electronAPI.onAIProgress(update => { if (!busy.value) return; if (typeof update === 'string') task.value = applyProgress(task.value, { message: update }); else task.value = applyProgress(task.value, update); });
onMounted(async () => { try { const settings = await call('settings'); endpoint.value = settings.baseUrl || '未配置百炼 API 地址'; assign(await call('open', props.video.id ? { id: props.video.id } : { filePath: props.video.path })); } catch (e) { error.value = e.message; } finally { loading.value = false; } });
onBeforeUnmount(() => { mounted = false; unsubscribe(); if (busy.value) window.electronAPI.ai('cancel'); });
</script>
<style scoped>
.notes-overlay { position: fixed; inset: 0; background: #0f172acc; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; }
.notes-dialog { background: #fff; border-radius: 14px; width: 1280px; max-width: 100%; height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 90px #0005; }
header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 16px 22px; border-bottom: 1px solid #e2e8f0; } header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace { display: grid; grid-template-columns: minmax(280px, 44%) minmax(0, 1fr); flex: 1; min-height: 0; }.player-pane, .report-pane { overflow-y: auto; padding: 24px; }.player-pane { background: #f5f7fa; }.player-pane > video { width: 100%; max-height: 45vh; background: #111; border-radius: 8px; }.player-pane p, small { color: #64748b; line-height: 1.7; font-size: 13px; }.consent { padding: 18px; margin-top: 24px; background: #fff; border: 1px solid #dce7e1; border-radius: 10px; }.consent label { display: block; margin: 16px 0; font-size: 14px; }
button, select { padding: 8px 12px; border: 1px solid #d4dfda; border-radius: 6px; background: #edf5ef; color: #24583f; cursor: pointer; }button:disabled { opacity: .45; cursor: default; }.toolbar { display: flex; flex-wrap: wrap; gap: 8px; }select { max-width: 100%; }.prose { white-space: pre-wrap; line-height: 1.85; }h2 { font-size: 24px; }h3 { margin-top: 30px; }h4 { margin: 10px 0; }article { border-bottom: 1px solid #eef2f7; padding: 14px 0; }.timestamp { background: transparent; color: #25815a; border: 0; padding: 0; font-size: 13px; }.frame { display: block; padding: 0; border: 0; width: min(100%, 320px); }textarea { width: 100%; padding: 12px; line-height: 1.8; border: 1px solid #b9d2c4; border-radius: 6px; font: inherit; }.error { color: #b42318 !important; }.empty, .missing { padding: 32px 0; color: #64748b; line-height: 1.8; }.missing button { display: block; margin-top: 12px; }
@media(max-width: 800px) { .notes-overlay { padding: 8px; }.workspace { display: block; overflow-y: auto; }.player-pane, .report-pane { overflow: visible; padding: 16px; } }
</style>
