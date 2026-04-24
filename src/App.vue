<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand">
        <h1>
          <img :src="appIcon" alt="MirroSpeak" class="brand-icon" />
          <span>MirroSpeak</span>
        </h1>
      </div>
      <nav class="nav-menu">
        <button 
          :class="['nav-item', { active: currentView === 'record' }]" 
          @click="currentView = 'record'"
        >
          <span class="icon">🔴</span>
          Record
        </button>
        <button 
          :class="['nav-item', { active: currentView === 'gallery' }]" 
          @click="currentView = 'gallery'"
        >
          <span class="icon">🖼️</span>
          Gallery
        </button>
        <button 
          :class="['nav-item', { active: currentView === 'settings' }]" 
          @click="currentView = 'settings'"
        >
          <span class="icon">⚙️</span>
          Settings
        </button>
      </nav>
    </aside>

    <div class="main-wrapper">
      <main class="content-area">
        <KeepAlive>
          <Recorder 
            v-if="currentView === 'record'" 
            class="view-container record-view"
            :saveDirectory="saveDirectory" 
            @video-saved="onVideoSaved" 
          />
        </KeepAlive>
        <div v-if="currentView === 'gallery'" class="view-container">
          <VideoGallery ref="galleryRef" :directory="saveDirectory" />
        </div>
        <div v-if="currentView === 'settings'" class="view-container">
          <Settings 
            :saveDirectory="saveDirectory" 
            @update:saveDirectoryAccess="updateSaveDirectoryAccess"
          />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import Recorder from './components/Recorder.vue';
import VideoGallery from './components/VideoGallery.vue';
import Settings from './components/Settings.vue';
import appIcon from '../assets/icons/icon.png';

const saveDirectoryAccess = ref(null);
const galleryRef = ref(null);
const currentView = ref('record');
const saveDirectory = computed(() => saveDirectoryAccess.value?.path || '');

const onVideoSaved = () => {
    // Optional: Switch to gallery view after saving, or just notify
    // currentView.value = 'gallery';
    // If we are in gallery view (unlikely if we just recorded), refresh it
    if (galleryRef.value) {
        galleryRef.value.refresh();
    }
};

const refreshGallery = () => {
    if (galleryRef.value) {
        galleryRef.value.refresh();
    }
};

const updateSaveDirectoryAccess = (value) => {
  saveDirectoryAccess.value = value;
};

onMounted(async () => {
  const savedAccess = await window.electronAPI.getConfig('saveDirectoryAccess');
  if (savedAccess?.path) {
    saveDirectoryAccess.value = savedAccess;
    return;
  }

  const savedPath = await window.electronAPI.getConfig('saveDirectory');
  if (savedPath) {
    saveDirectoryAccess.value = { path: savedPath, bookmark: '' };
  }
});
</script>

<style>
* {
  box-sizing: border-box;
}

body {
    margin: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background-color: #f5f7fa;
    color: #2c3e50;
    height: 100vh;
    overflow: hidden;
}

.app-layout {
  display: flex;
  height: 100vh;
  width: 100%;
}

.sidebar {
  width: 250px;
  background: #dfe0e1;
  color: #2c3e50;
  display: flex;
  flex-direction: column;
  padding: 20px;
  flex-shrink: 0;
  border-right: 1px solid #d1d5db;
}

.brand h1 {
    margin: 0 0 40px 0;
    font-size: 1.5rem;
    color: #2c3e50;
    display: flex;
    align-items: center;
    gap: 10px;
}

.brand-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.nav-menu {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 15px;
  background: transparent;
  border: none;
  color: #64748b;
  text-align: left;
  font-size: 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-item:hover {
  background: #edf2f7;
  color: #2d3748;
}

.nav-item.active {
  background: #42b983;
  color: white;
  font-weight: 600;
}

.nav-item .icon {
  font-size: 1.2rem;
}

.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 15px 30px;
  border-bottom: 1px solid #eef2f7;
  height: 70px;
  box-sizing: border-box;
}

.view-title h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #2c3e50;
}

.settings {
  display: flex;
  gap: 15px;
  align-items: center;
}

.path-display {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    text-align: left;
}

.path-display .label {
    color: #888;
    font-size: 0.75rem;
}

.path-display .value {
    font-weight: 500;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.btn-secondary {
    background-color: #eef2f7;
    color: #5b6b79;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-secondary:hover {
    background-color: #dfe6ed;
    color: #333;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 30px;
  overflow-y: auto;
  background-color: #f5f7fa;
}

.view-container {
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.record-view {
  flex: 1;
  display: flex;
}

@media (max-width: 768px) {
  .app-layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    height: auto;
    flex-direction: row;
    padding: 10px;
    order: 2;
    justify-content: space-around;
  }

  .brand {
    display: none;
  }

  .nav-menu {
    flex-direction: row;
    width: 100%;
    justify-content: space-around;
    gap: 0;
  }

  .nav-item {
    flex-direction: column;
    padding: 8px;
    font-size: 0.8rem;
    gap: 4px;
    border-radius: 8px;
  }

  .nav-item .icon {
    font-size: 1.5rem;
    margin-bottom: 2px;
  }

  .main-wrapper {
    order: 1;
    height: calc(100vh - 80px); /* Approximate height of bottom bar */
  }

  .top-bar {
    padding: 10px 15px;
    height: auto;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }

  .settings {
    width: 100%;
    justify-content: space-between;
  }
  
  .path-display {
      text-align: left;
  }
  
  .path-display .value {
      max-width: 200px;
  }

  .content-area {
    padding: 15px;
  }
}
</style>
