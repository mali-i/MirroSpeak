<template>
  <div class="gallery">
    <div class="gallery-info">
      <span class="gallery-title">Recorded Videos</span>
      <span class="gallery-path">{{ directory }}</span>
    </div>
    <div v-if="videos.length === 0" class="no-videos">No videos found.</div>
    <div class="video-grid">
      <div v-for="video in videos" :key="video.path" class="video-item" @click="playVideo(video)">
        <div class="video-thumbnail">
            <img 
              :src="getThumbnailUrl(video.path)" 
              loading="lazy" 
              alt="Video thumbnail" 
              @error="handleThumbnailError"
            />
            <div class="play-icon">▶</div>
        </div>
        <div class="video-info">
          <form
            v-if="renamingPath === video.path"
            class="rename-form"
            @click.stop
            @submit.prevent="submitRename(video)"
          >
            <input
              :ref="setRenameInput"
              v-model="renameValue"
              class="rename-input"
              type="text"
              maxlength="200"
              aria-label="New video name"
              @keydown.esc.prevent="cancelRename"
            />
            <button class="rename-confirm" type="submit" :disabled="renamePending">Save</button>
            <button class="rename-cancel" type="button" :disabled="renamePending" @click="cancelRename">Cancel</button>
          </form>
          <div v-else class="video-name-row">
            <div class="video-name" :title="video.name">{{ video.name }}</div>
            <button class="rename-btn" type="button" title="Rename video" @click.stop="startRename(video)">Rename</button>
          </div>
          <div class="video-date">{{ formatDate(video.createdAt) }}</div>
        </div>
      </div>
    </div>
    
    <div v-if="selectedVideo" class="video-modal" @click.self="closeModal">
        <div class="modal-content">
            <video 
              :src="getVideoUrl(selectedVideo.path)" 
              :poster="getThumbnailUrl(selectedVideo.path)"
              controls 
              autoplay
              playsinline
              @error="handleVideoError"
            ></video>
            <div class="modal-footer">
                <span>{{ selectedVideo.name }}</span>
                <div class="modal-actions">
                  <button class="close-btn" @click="closeModal">Close</button>
                </div>
            </div>
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue';
import dayjs from 'dayjs';

const props = defineProps({
  directory: String
});

const videos = ref([]);
const selectedVideo = ref(null);
const renamingPath = ref('');
const renameValue = ref('');
const renamePending = ref(false);
let renameInput = null;

const loadVideos = async () => {
  if (props.directory) {
    videos.value = await window.electronAPI.getVideos(props.directory);
  } else {
    videos.value = [];
  }
};

const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
};

const getThumbnailUrl = (path) => {
  // Use custom thumbnail:// protocol
  return `thumbnail://local${path}`;
};

const getVideoUrl = (path) => {
  // Use custom media:// protocol for secure and reliable playback
  // Using 'local' as a dummy host to ensure standard URL parsing works correctly
  try {
    return `media://local${path}`;
  } catch (e) {
    console.error('Failed to create media URL:', e);
    return '';
  }
};

const playVideo = (video) => {
    selectedVideo.value = video;
};

const setRenameInput = (element) => {
  renameInput = element;
};

const startRename = async (video) => {
  renamingPath.value = video.path;
  renameValue.value = video.name.replace(/\.(webm|mp4)$/i, '');
  await nextTick();
  renameInput?.focus();
  renameInput?.select();
};

const cancelRename = () => {
  if (renamePending.value) return;
  renamingPath.value = '';
  renameValue.value = '';
};

const submitRename = async (video) => {
  const newName = renameValue.value.trim();
  if (!newName || renamePending.value) return;

  renamePending.value = true;
  try {
    const result = await window.electronAPI.renameVideo({
      filePath: video.path,
      newName,
    });
    if (!result.success) {
      alert(`Failed to rename video: ${result.error}`);
      return;
    }

    renamingPath.value = '';
    renameValue.value = '';
    await loadVideos();
  } catch (error) {
    alert(`Failed to rename video: ${error.message}`);
  } finally {
    renamePending.value = false;
  }
};

const closeModal = () => {
    selectedVideo.value = null;
};

const handleThumbnailError = (e) => {
    // Fallback to a generic video icon if thumbnail generation fails
    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMCA4djhsNi00LTYtNHptOS01SDVjLTEuMSAwLTIgLjktMiAydjE0YzAgMS4xLjkgMiAyIDJoMTRjMS4xIDAgMi0uOSAyLTJWNWMwLTEuMS0uOS0yLTItMnptMCAxNkg1VjVoMTR2MTR6Ii8+PC9zdmc+';
    e.target.style.objectFit = 'scale-down';
    e.target.style.padding = '20px';
    e.target.style.backgroundColor = '#333';
};

const handleVideoError = (e) => {
    console.error('Video playback error:', e.target.error, e.target.src);
    alert(`Failed to play video. Error code: ${e.target.error ? e.target.error.code : 'unknown'}`);
};

watch(() => props.directory, loadVideos);
onMounted(loadVideos);

defineExpose({ refresh: loadVideos });
</script>

<style scoped>
.gallery {
    width: 100%;
}

.gallery-info {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 24px;
}

.gallery-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #2c3e50;
}

.gallery-path {
  font-size: 0.85rem;
  color: #7f8c8d;
  font-family: monospace;
}

.no-videos {
    color: #666;
    font-style: italic;
    text-align: center;
    margin: 40px 0;
}
.video-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 20px;
}

@media (max-width: 600px) {
    .video-grid {
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 10px;
    }
    
    .video-thumbnail {
        height: 100px;
    }
    
    .play-icon {
        font-size: 24px;
    }
}

.video-item {
    background: #fff;
    border: 1px solid #eee;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}
.video-item:hover {
    transform: translateY(-5px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}
.video-thumbnail {
    position: relative;
    height: 150px;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
}
.video-thumbnail video,
.video-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.play-icon {
    position: absolute;
    font-size: 30px;
    color: white;
    opacity: 0.8;
    text-shadow: 0 0 10px rgba(0,0,0,0.5);
}
.video-info {
    padding: 12px;
}
.video-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 5px;
}
.video-name {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    font-size: 0.9em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.rename-btn {
    flex-shrink: 0;
    padding: 3px 7px;
    border: 1px solid #d7dee5;
    border-radius: 4px;
    background: #f7f9fb;
    color: #52606d;
    font-size: 0.75rem;
    cursor: pointer;
}
.rename-btn:hover {
    background: #edf2f7;
}
.rename-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 5px;
    margin-bottom: 5px;
}
.rename-input {
    min-width: 0;
    padding: 4px 6px;
    border: 1px solid #42b983;
    border-radius: 4px;
    font: inherit;
}
.rename-confirm,
.rename-cancel {
    padding: 4px 7px;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 0.75rem;
    cursor: pointer;
}
.rename-confirm {
    background: #42b983;
}
.rename-cancel {
    background: #7f8c8d;
}
.rename-confirm:disabled,
.rename-cancel:disabled {
    cursor: wait;
    opacity: 0.65;
}
.video-date {
    font-size: 0.8em;
    color: #888;
    margin-bottom: 8px;
}

.video-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(5px);
}
.modal-content {
    background: white;
    padding: 0;
    border-radius: 8px;
    width: 90%;
    max-width: 1000px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

@media (max-width: 600px) {
    .modal-content {
        width: 95%;
    }
    
    .modal-footer {
        flex-direction: column;
        gap: 10px;
        align-items: stretch;
        text-align: center;
    }
    
    .close-btn {
        width: 100%;
    }
}

.modal-content video {
    width: 100%;
    max-height: 70vh;
    background: black;
}
.modal-footer {
    padding: 15px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #eee;
}
.modal-actions {
    display: flex;
    gap: 10px;
}

.close-btn {
    padding: 8px 16px;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
</style>
