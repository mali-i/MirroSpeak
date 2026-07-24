<template>
  <div class="outline-panel" :class="{ 'is-disabled': disabled }">
    <div class="outline-header">
      <div class="title-copy">
        <span>录制前整理表达顺序</span>
      </div>
    </div>
    <div class="outline-content">
      <textarea 
        v-model="outlineText" 
        class="outline-textarea"
        :disabled="disabled"
      ></textarea>
    </div>
    <div class="outline-footer">
      <span>{{ outlineText.length }} 字</span>
      <div class="outline-footer-actions">
        <button
          type="button"
          @click="clearOutline"
          class="btn-clear"
          title="清空大纲"
          :disabled="!outlineText || disabled"
        >
          清空
        </button>
        <span>{{ disabled ? '录制中锁定' : '自动保存' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';

defineProps({
  disabled: {
    type: Boolean,
    default: false
  }
});

const outlineText = ref('');

const saveOutline = () => {
  localStorage.setItem('recording_outline', outlineText.value);
};

const loadOutline = () => {
  const saved = localStorage.getItem('recording_outline');
  if (saved) {
    outlineText.value = saved;
  }
};

const clearOutline = () => {
  if (confirm('确定要清空脚本大纲吗？')) {
    outlineText.value = '';
  }
};

onMounted(() => {
  loadOutline();
});

watch(outlineText, () => {
  saveOutline();
});
</script>

<style scoped>
.outline-panel {
  flex: 0 0 320px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid #dde5ee;
  border-radius: 8px;
  padding: 16px 16px 0;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: flex-basis 0.2s ease, border-color 0.2s ease;
  max-height: 640px;
}

.outline-panel.is-disabled {
  background: rgba(251, 252, 253, 0.75);
}

.outline-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.title-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.title-copy span {
  color: #8492a6;
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
}

.btn-clear {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid #e4e9f0;
  border-radius: 6px;
  cursor: pointer;
  color: inherit;
  font: inherit;
  padding: 3px 7px;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.btn-clear:hover:not(:disabled) {
  background: #fff5f5;
  border-color: #fecaca;
  color: #ef4444;
}

.btn-clear:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.outline-content {
  background: transparent;
  border-radius: 6px;
  border: 1px solid #dfe6ee;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 260px;
  overflow: hidden;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.outline-content:focus-within {
  border-color: #42b983;
  background: transparent;
}

.outline-textarea {
  width: 100%;
  flex: 1;
  border: none;
  background:
    linear-gradient(transparent 31px, rgba(220, 227, 235, 0.72) 32px) 0 0 / 100% 32px;
  font-family: inherit;
  font-size: 14px;
  line-height: 32px;
  resize: none;
  color: #2c3e50;
  padding: 10px 12px 12px;
  outline: none;
  display: block;
  caret-color: #42b983;
  scrollbar-width: thin;
  scrollbar-color: rgba(100, 116, 139, 0.42) transparent;
}

.outline-textarea::-webkit-scrollbar {
  width: 8px;
}

.outline-textarea::-webkit-scrollbar-track {
  background: transparent;
}

.outline-textarea::-webkit-scrollbar-thumb {
  min-height: 32px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.42);
  background-clip: padding-box;
}

.outline-textarea::-webkit-scrollbar-thumb:hover {
  background: rgba(71, 85, 105, 0.62);
  background-clip: padding-box;
}

.outline-textarea::placeholder {
  color: #9aa7b5;
}

.outline-textarea:disabled {
  cursor: not-allowed;
  color: #64748b;
  background:
    linear-gradient(transparent 31px, rgba(220, 227, 235, 0.72) 32px) 0 0 / 100% 32px;
}

.outline-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid #e3e9f0;
  color: #7f8b9b;
  font-size: 12px;
  line-height: 1;
  margin: 8px -16px 0;
  padding: 5px 16px;
  background: transparent;
  border-radius: 0 0 7px 7px;
}

.outline-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 600px) {
  .outline-panel {
    flex: none;
    width: 100%;
  }

  .title-copy span {
    white-space: normal;
  }
}
</style>
