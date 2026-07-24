<template>
  <div class="outline-panel" :class="{ 'is-disabled': disabled }">
    <div class="outline-header">
      <div class="title-copy">
          <h3>脚本大纲</h3>
          <span>录制前整理表达顺序</span>
      </div>
      <div class="outline-actions">
        <button
          type="button"
          @click="clearOutline"
          class="btn-clear"
          title="清空大纲"
          :disabled="!outlineText || disabled"
        >
          清空
        </button>
      </div>
    </div>
    <div class="outline-content">
      <textarea 
        v-model="outlineText" 
        placeholder="开场&#10;要点一&#10;要点二&#10;收尾"
        class="outline-textarea"
        :disabled="disabled"
      ></textarea>
      <div class="outline-footer">
        <span>{{ outlineText.length }} 字</span>
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
  background: #ffffff;
  border: 1px solid #dde5ee;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: flex-basis 0.2s ease, border-color 0.2s ease;
  max-height: 640px;
}

.outline-panel.is-disabled {
  background: #fbfcfd;
}

.outline-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.outline-header h3 {
  margin: 0;
  font-size: 15px;
  line-height: 1.25;
  color: #2c3e50;
  white-space: nowrap;
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
  background: #ffffff;
  border: 1px solid #e4e9f0;
  border-radius: 6px;
  cursor: pointer;
  color: #6b7788;
  font-size: 12px;
  font-weight: 500;
  padding: 5px 9px;
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
  background: #fcfcfd;
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
  background: #ffffff;
}

.outline-textarea {
  width: 100%;
  flex: 1;
  border: none;
  background:
    linear-gradient(#fcfcfd 31px, #edf1f5 32px) 0 0 / 100% 32px;
  font-family: inherit;
  font-size: 14px;
  line-height: 32px;
  resize: none;
  color: #2c3e50;
  padding: 10px 12px 12px;
  outline: none;
  display: block;
  caret-color: #42b983;
}

.outline-textarea::placeholder {
  color: #9aa7b5;
}

.outline-textarea:disabled {
  cursor: not-allowed;
  color: #64748b;
  background:
    linear-gradient(#f7f9fb 31px, #e8edf3 32px) 0 0 / 100% 32px;
}

.outline-footer {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid #e3e9f0;
  color: #7f8b9b;
  font-size: 12px;
  line-height: 1;
  padding: 9px 12px;
  background: #f8fafc;
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
