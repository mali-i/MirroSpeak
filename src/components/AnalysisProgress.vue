<template>
  <section class="task-card" :class="task.status" aria-label="视频分析进度">
    <div class="task-heading"><strong>{{ heading }}</strong><span>已用 {{ elapsed }}</span></div>
    <p v-if="task.plan">{{ task.plan.model }} · {{ task.plan.method }}</p>
    <ol class="steps">
      <li v-for="(step, index) in steps" :key="step.id" :class="stepState(step.id)">
        <span class="step-dot">{{ stepState(step.id) === 'done' ? '✓' : index + 1 }}</span>{{ step.label }}
      </li>
    </ol>
    <p role="status" aria-live="polite">{{ task.message }}</p>
    <div v-if="task.status === 'running'" class="meter" :class="{ indeterminate: !measurable }" role="progressbar" :aria-label="heading" :aria-valuenow="measurable ? Math.round(task.percent) : undefined" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ width: measurable ? `${task.percent}%` : '35%' }" /></div>
    <div class="task-detail"><span>{{ detail }}<template v-if="task.stage === 'analyze' && task.status === 'running' && task.lastActivityAt"> · 距上次响应 {{ Math.max(0, Math.floor((now - task.lastActivityAt) / 1000)) }} 秒</template></span><b v-if="measurable && task.status === 'running'">{{ Math.floor(task.percent) }}%</b></div>
    <p v-if="task.warning" class="warning">{{ task.warning }}</p>
    <p v-if="task.status === 'failed'" class="help">原视频和已有笔记保留。重新勾选上传说明后可重试，重试可能产生新的 API 费用。</p>
    <p v-if="task.status === 'cancelled'" class="help">已停止本次处理；服务商已接收的请求仍可能计费。</p>
  </section>
</template>
<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({ task: { type: Object, required: true } });
const now = ref(Date.now()); let timer;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => clearInterval(timer));
const measurable = computed(() => Number.isFinite(props.task.percent));
const steps = computed(() => props.task.plan?.steps || []);
const currentIndex = computed(() => steps.value.findIndex(step => step.id === props.task.stage));
const heading = computed(() => props.task.status === 'complete' ? '个人笔记已完成' : props.task.status === 'cancelled' ? '任务已取消' : props.task.status === 'failed' ? `${steps.value[currentIndex.value]?.label || '处理'}未完成` : '正在生成个人笔记');
const elapsed = computed(() => { const seconds = Math.max(0, Math.floor(((props.task.finishedAt || now.value) - props.task.startedAt) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; });
const bytes = value => `${(value / 1024 / 1024).toFixed(1)} MB`;
const detail = computed(() => {
  if (props.task.status === 'complete') return '报告已保存在本机，可查看、编辑和导出。';
  if (props.task.unit === 'bytes' && props.task.total > 0 && props.task.status === 'running') return Number.isFinite(props.task.current) ? `${bytes(props.task.current)} / ${bytes(props.task.total)}` : `本次传输约 ${bytes(props.task.total)} · 服务商未提供实时传输比例`;
  if (props.task.stage === 'analyze' && props.task.status === 'running') return '模型未提供完成比例，正在等待结果；耗时取决于视频长度和服务商负载。';
  if (props.task.status === 'running') return measurable.value ? '显示当前阶段的实际进度' : '当前阶段进行中';
  return '';
});
function stepState(id) {
  return props.task.stepStates?.[id] || 'pending';
}
</script>
<style scoped>
.task-card { background: #fff; border: 1px solid #cfe4d7; border-radius: 12px; padding: 18px; margin-top: 20px; }.task-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }.task-heading strong { font-size: 15px; color: #24583f; }.task-heading > span { color: #64748b; font-size: 12px; font-variant-numeric: tabular-nums; }.steps { display: grid; grid-template-columns: repeat(3, 1fr); list-style: none; padding: 0; margin: 20px 0; gap: 14px 8px; }.steps li { display: flex; gap: 5px; align-items: center; font-size: 11px; color: #94a3b8; }.step-dot { width: 19px; height: 19px; border: 1px solid #d7e0db; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }.steps .done { color: #37835c; }.done .step-dot { background: #e6f4eb; border-color: #e6f4eb; }.steps .active { color: #176c43; font-weight: 600; }.active .step-dot { background: #278756; color: white; border-color: #278756; }.steps .stopped { color: #b45309; }.task-card p { font-size: 13px; line-height: 1.7; margin: 10px 0; color: #475569; }.meter { background: #e8efeb; height: 6px; border-radius: 9px; overflow: hidden; margin-top: 14px; }.meter span { display: block; height: 100%; background: #3d9c6c; border-radius: inherit; transition: width .25s; }.indeterminate span { animation: pulse-progress 1.6s ease-in-out infinite alternate; }.task-detail { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: #64748b; margin-top: 9px; line-height: 1.7; }.task-card .warning { color: #a65b09; }.task-card .help { color: #64748b; font-size: 12px; }.failed { border-color: #efc7bc; }.cancelled { border-color: #d9dfe7; }@keyframes pulse-progress { from { transform: translateX(-70%); } to { transform: translateX(270%); } }@media(prefers-reduced-motion: reduce) { .indeterminate span { animation: none; } }
</style>
