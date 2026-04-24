<template>
  <div class="settings-page">
    <!-- Storage Path Section -->
    <div class="settings-section">
      <h3>Storage Location</h3>
      <div class="selector-group">
        <label>Current Path:</label>
        <div class="path-row">
          <div class="path-value">{{ saveDirectory || 'Not selected' }}</div>
          <button @click="selectDirectory" class="btn-secondary">Change Folder</button>
        </div>
      </div>
    </div>

    <!-- File Naming Section -->
    <div class="settings-section mt-6">
      <h3>File Naming</h3>
      <div class="selector-group">
        <label>Default Filename Prefix:</label>
        <input 
          v-model="defaultFilenamePrefix" 
          @input="saveSettings" 
          placeholder="e.g. video"
          class="settings-input"
        />
        <p class="hint">Result: {{ defaultFilenamePrefix || 'video' }}_2026-01-29_12-00-00.mp4</p>
      </div>
    </div>

    <!-- Device Settings Section -->
    <div class="settings-section mt-6">
      <h3>Device Settings</h3>
      
      <div class="device-selectors">
        <div class="selector-group">
          <label>📷 Camera:</label>
          <select v-model="selectedVideoDeviceId" @change="saveSettings">
            <option v-for="device in videoDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label || `Camera ${videoDevices.indexOf(device) + 1}` }}
            </option>
          </select>
        </div>
        
        <div class="selector-group">
          <label>🎤 Microphone:</label>
          <select v-model="selectedAudioDeviceId" @change="saveSettings">
            <option v-for="device in audioDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label || `Microphone ${audioDevices.indexOf(device) + 1}` }}
            </option>
          </select>
        </div>
        
        <button 
          class="btn-refresh" 
          @click="getDevices" 
          title="Refresh Device List"
          :class="{ 'spinning': isRefreshingDevices }"
        >🔄 Refresh Devices</button>

        <div v-if="statusMessage" class="status-message" :class="statusType">
          {{ statusMessage }}
        </div>
      </div>
      
      <div class="preview-area">
        <h4>Preview</h4>
        <div class="video-container">
          <video ref="videoPreview" autoplay muted playsinline></video>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  saveDirectory: String
});

const emit = defineEmits(['update:saveDirectoryAccess']);

const videoDevices = ref([]);
const audioDevices = ref([]);
const selectedVideoDeviceId = ref('');
const selectedAudioDeviceId = ref('');
const defaultFilenamePrefix = ref('video');
const isRefreshingDevices = ref(false);
const videoPreview = ref(null);
const stream = ref(null);
const statusMessage = ref('');
const statusType = ref('');

const selectDirectory = async () => {
  const directoryAccess = await window.electronAPI.selectDirectory();
  if (directoryAccess?.path) {
    emit('update:saveDirectoryAccess', directoryAccess);
    await window.electronAPI.setConfig('saveDirectoryAccess', directoryAccess);
    await window.electronAPI.setConfig('saveDirectory', directoryAccess.path);
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

const getDevices = async () => {
  isRefreshingDevices.value = true;
  try {
    // Request permission first to get device labels
    let tempStream = null;
    if (!stream.value) {
      try {
        tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (e) {
        console.warn("Could not get temp stream for permissions:", e);
      }
    }
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    if (tempStream) {
      tempStream.getTracks().forEach(track => track.stop());
    }
    
    // Filter out 'default' devices to avoid duplicates (e.g. "Default - Microphone" vs "Microphone")
    const allVideo = devices.filter(device => device.kind === 'videoinput');
    const allAudio = devices.filter(device => device.kind === 'audioinput');
    
    videoDevices.value = allVideo.filter(d => d.deviceId !== 'default');
    if (videoDevices.value.length === 0) videoDevices.value = allVideo;

    audioDevices.value = allAudio.filter(d => d.deviceId !== 'default');
    if (audioDevices.value.length === 0) audioDevices.value = allAudio;
    
    // Load saved settings or set defaults
    const savedVideo = localStorage.getItem('selectedVideoDeviceId');
    const savedAudio = localStorage.getItem('selectedAudioDeviceId');
    
    if (savedVideo && videoDevices.value.find(d => d.deviceId === savedVideo)) {
      selectedVideoDeviceId.value = savedVideo;
    } else if (!selectedVideoDeviceId.value && videoDevices.value.length > 0) {
      selectedVideoDeviceId.value = videoDevices.value[0].deviceId;
    }
    
    if (savedAudio && audioDevices.value.find(d => d.deviceId === savedAudio)) {
      selectedAudioDeviceId.value = savedAudio;
    } else if (!selectedAudioDeviceId.value && audioDevices.value.length > 0) {
      selectedAudioDeviceId.value = audioDevices.value[0].deviceId;
    }
    
    // Load filename prefix
    const savedPrefix = await window.electronAPI.getConfig('defaultFilenamePrefix');
    if (savedPrefix) {
      defaultFilenamePrefix.value = savedPrefix;
    }
    
    saveSettings();
    showStatus(`Devices updated: ${videoDevices.value.length} cameras, ${audioDevices.value.length} microphones found`, 'success');
  } catch (err) {
    console.error("Error getting devices:", err);
    showStatus('Error refreshing devices: ' + err.message, 'error');
  } finally {
    isRefreshingDevices.value = false;
  }
};

const startCamera = async () => {
  try {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop());
    }

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
  }
};

const saveSettings = () => {
  if (selectedVideoDeviceId.value) {
    localStorage.setItem('selectedVideoDeviceId', selectedVideoDeviceId.value);
  }
  if (selectedAudioDeviceId.value) {
    localStorage.setItem('selectedAudioDeviceId', selectedAudioDeviceId.value);
  }
  if (defaultFilenamePrefix.value) {
    window.electronAPI.setConfig('defaultFilenamePrefix', defaultFilenamePrefix.value);
  }
};

watch(selectedVideoDeviceId, () => {
  startCamera();
  saveSettings();
});

onMounted(async () => {
  // Start camera first to get permissions and show preview
  // This avoids double permission requests in getDevices
  await startCamera();
  await getDevices();
  navigator.mediaDevices.addEventListener('devicechange', getDevices);
});

onUnmounted(() => {
  navigator.mediaDevices.removeEventListener('devicechange', getDevices);
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop());
  }
});
</script>

<style scoped>
.settings-page {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.settings-section {
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.path-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.path-value {
  flex: 1;
  padding: 10px 14px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  font-family: monospace;
  font-size: 13px;
  color: #495057;
  word-break: break-all;
  min-height: 38px;
  display: flex;
  align-items: center;
}

.btn-secondary {
  padding: 0 16px;
  height: 38px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  color: #444;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-secondary:hover {
  background: #f0f0f0;
  border-color: #ccc;
}

.mt-6 {
  margin-top: 1.5rem;
}

.device-selectors {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 20px;
}

.selector-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.selector-group label {
  font-weight: 600;
  color: #666;
}

.selector-group select, .settings-input {
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 14px;
}

.settings-input:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 2px rgba(74,144,226,0.1);
}

.hint {
  font-size: 12px;
  color: #888;
  margin: 0;
}

.btn-refresh {
  padding: 10px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 500;
}

.btn-refresh:hover {
  background: #e0e0e0;
}

.btn-refresh.spinning {
  opacity: 0.7;
  pointer-events: none;
}

.status-message {
  margin-top: 5px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
}

.status-message.success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.status-message.error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.status-message.info {
  background-color: #cce5ff;
  color: #004085;
  border: 1px solid #b8daff;
}

.video-container {
  width: 100%;
  max-width: 480px;
  aspect-ratio: 16/9;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 10px;
}

video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
