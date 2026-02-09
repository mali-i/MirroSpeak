<template>
  <div class="recorder">
    <div class="recorder-info">
      <span class="recorder-title">New Recording</span>
      <span class="recorder-path">{{ saveDirectory }}</span>
    </div>
    <div class="main-layout">
      <div class="video-container">
        <video ref="videoPreview" autoplay muted playsinline></video>
        <div v-if="isRecording" class="recording-indicator">🔴 Recording</div>
        <div v-if="statusMessage" class="status-message" :class="statusType">{{ statusMessage }}</div>
      </div>
      
      <!-- Outline Panel -->
      <!-- <OutlinePanel /> -->
    </div>

    <div class="controls">
      <button 
        v-if="!isRecording" 
        @click="startRecording" 
        :disabled="!stream" 
        class="btn-start"
      >
        <span class="btn-icon">🎥</span>
        Start Recording
      </button>
      <button 
        v-else 
        @click="stopRecording" 
        class="btn-stop"
      >
        <span class="btn-icon">⏹</span>
        Stop Recording
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, onActivated, onDeactivated, computed, watch } from 'vue';
import dayjs from 'dayjs';
// import OutlinePanel from './OutlinePanel.vue';

const props = defineProps({
  saveDirectory: String
});

const emit = defineEmits(['video-saved']);

const videoPreview = ref(null);
const stream = ref(null);
const mediaRecorder = ref(null);
const isRecording = ref(false);
const recordedChunks = ref([]);
const isSaving = ref(false);
const statusMessage = ref('');
const statusType = ref('info');
const filenamePrefix = ref('video');

// Devices
const selectedVideoDeviceId = ref('');
const selectedAudioDeviceId = ref('');

const loadFilenamePrefix = async () => {
  const savedPrefix = await window.electronAPI.getConfig('defaultFilenamePrefix');
  if (savedPrefix) {
    filenamePrefix.value = savedPrefix;
  }
};

const showStatus = (message, type = 'info', duration = 3000) => {
  statusMessage.value = message;
  statusType.value = type;
  if (duration > 0) {
    setTimeout(() => {
      statusMessage.value = '';
    }, duration);
  }
};

const startCamera = async () => {
  try {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop());
    }

    // Load settings from localStorage
    selectedVideoDeviceId.value = localStorage.getItem('selectedVideoDeviceId') || '';
    selectedAudioDeviceId.value = localStorage.getItem('selectedAudioDeviceId') || '';

    const constraints = {
      video: selectedVideoDeviceId.value ? { deviceId: { exact: selectedVideoDeviceId.value } } : true,
      audio: selectedAudioDeviceId.value ? { deviceId: { exact: selectedAudioDeviceId.value } } : true
    };

    stream.value = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoPreview.value) {
      videoPreview.value.srcObject = stream.value;
    }
  } catch (err) {
    console.error("Error accessing camera:", err);
    showStatus('Failed to access camera/microphone', 'error');
  }
};

const startRecording = () => {
  if (!props.saveDirectory) {
      alert("Please select a storage directory first.");
      return;
  }

  recordedChunks.value = [];
  
  // Try to use MP4 format, fallback to WebM if not supported
  let mimeType = 'video/webm;codecs=vp9';
  let fileExtension = 'webm';
  
  if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
    fileExtension = 'mp4';
  } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
    mimeType = 'video/mp4;codecs=avc1';
    fileExtension = 'mp4';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
    // Some systems support H.264 in WebM container
    mimeType = 'video/webm;codecs=h264';
    fileExtension = 'webm';
  }
  
  console.log('Recording with mimeType:', mimeType);
  mediaRecorder.value = new MediaRecorder(stream.value, { mimeType });
  
  mediaRecorder.value.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.value.push(event.data);
    }
  };

  mediaRecorder.value.onstop = async () => {
    if (isSaving.value) {
      console.log('Already saving, skipping duplicate save');
      return;
    }
    
    if (recordedChunks.value.length === 0) {
      console.error('No recorded chunks available');
      alert('Failed to save video: No data recorded');
      isRecording.value = false;
      return;
    }

    isSaving.value = true;
    
    try {
      const blob = new Blob(recordedChunks.value, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      const prefix = filenamePrefix.value.trim() || 'video';
      const filename = `${prefix}_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.${fileExtension}`;
      
      const result = await window.electronAPI.saveVideo({
        buffer,
        filename,
        directory: props.saveDirectory
      });
      
      if (result.success) {
        showStatus('Video saved successfully! ✅', 'success', 3000);
        emit('video-saved');
      } else {
        showStatus(`Failed to save video: ${result.error}`, 'error', 5000);
      }
    } finally {
      recordedChunks.value = [];
      isRecording.value = false;
      isSaving.value = false;
    }
  };

  mediaRecorder.value.start();
  isRecording.value = true;
  showStatus('Recording started! 🎬', 'success', 2000);
};

const stopRecording = () => {
  if (mediaRecorder.value && isRecording.value) {
    showStatus('Processing video...', 'info', 0);
    mediaRecorder.value.stop();
  }
};

const stopCamera = () => {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop());
  }
};

onMounted(async () => {
  // Start camera on initial mount
  // Note: startCamera is also called in onActivated which triggers on first mount
  // so we don't need to call it here to avoid duplicate requests at startup.
  await loadFilenamePrefix();
});

onActivated(async () => {
  // Restart camera when switching back to this tab
  await loadFilenamePrefix();
  await startCamera();
});

onDeactivated(() => {
  // Stop camera when switching away to save resources
  stopCamera();
});

onUnmounted(() => {
  stopCamera();
});
</script>

<style scoped>
.recorder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.recorder-info {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 24px;
  width: 100%;
  justify-content: flex-start;
}

.recorder-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #2c3e50;
}

.recorder-path {
  font-size: 0.85rem;
  color: #7f8c8d;
  font-family: monospace;
}

.main-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch; /* Stretch children to have same height */
  gap: 20px;
  width: 100%;
  justify-content: center;
  flex-wrap: nowrap;
}

.device-selectors {
  display: flex;
  gap: 20px;
  width: 100%;
  max-width: 640px;
  margin-bottom: 10px;
}

.selector-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.selector-group label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
}

.selector-group select {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: white;
  font-size: 14px;
  outline: none;
}

.selector-group select:disabled {
  background: #f5f5f5;
  color: #999;
  cursor: not-allowed;
}

.btn-refresh {
  align-self: flex-end;
  padding: 8px 12px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
  font-size: 16px;
  transition: background 0.2s;
}

.btn-refresh:hover {
  background: #f0f0f0;
}

.btn-refresh.spinning {
  animation: spin 1s linear infinite;
  pointer-events: none;
  opacity: 0.7;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.video-container {
  position: relative;
  flex: 1;
  min-width: 0; /* Allow shrinking below content size */
  max-width: 640px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 16/9;
}
video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.recording-indicator {
  position: absolute;
  top: 10px;
  right: 10px;
  color: white;
  background: rgba(255, 0, 0, 0.7);
  padding: 5px 10px;
  border-radius: 4px;
  font-weight: bold;
  animation: blink 1s infinite;
}

@keyframes blink {
  50% { opacity: 0.5; }
}

.status-message {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
  animation: slideUp 0.3s ease;
  max-width: 90%;
  text-align: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.status-message.info {
  background: rgba(52, 152, 219, 0.9);
  color: white;
}

.status-message.success {
  background: rgba(46, 204, 113, 0.9);
  color: white;
}

.status-message.error {
  background: rgba(231, 76, 60, 0.9);
  color: white;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.controls button {
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  color: white;
  border: none;
  border-radius: 8px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn-start {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.btn-start:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-stop {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  animation: pulse 2s infinite;
}

.btn-stop:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(245, 87, 108, 0.3);
  }
  50% {
    box-shadow: 0 2px 16px rgba(245, 87, 108, 0.6);
  }
}

.controls button:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-icon {
  font-size: 18px;
}

@media (max-width: 600px) {
    .controls {
        display: flex;
        flex-direction: column;
        width: 100%;
        gap: 10px;
    }
    
    .controls button {
        width: 100%;
    }
}
</style>
