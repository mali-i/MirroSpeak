<template>
  <img v-if="image" :src="image" :alt="`原视频 ${Math.floor(seconds)} 秒处画面`" />
  <video v-else-if="!failed" :src="src" crossorigin="anonymous" muted preload="auto" playsinline @loadedmetadata="seek" @seeked="capture" @error="failed = true" />
  <span v-else>画面暂不可用</span>
</template>
<script setup>
import { ref } from 'vue';
const props = defineProps({ src: String, seconds: Number, saved: String });
const emit = defineEmits(['capture']);
const image = ref(props.saved || ''), failed = ref(false);
function seek(event) { event.target.currentTime = Math.max(0.01, props.seconds); }
function capture(event) {
  try { const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180; canvas.getContext('2d').drawImage(event.target, 0, 0, 320, 180); image.value = canvas.toDataURL('image/jpeg', .75); emit('capture', image.value); }
  catch { failed.value = true; }
}
</script>
<style scoped>img, video { width: 100%; aspect-ratio: 16/9; object-fit: contain; background: #0f172a; border-radius: 6px; } span { font-size: 12px; color: #94a3b8; }</style>
