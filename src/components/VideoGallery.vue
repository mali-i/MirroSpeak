<template>
  <div class="gallery">
    <div class="gallery-info">
      <div class="gallery-heading">
        <span class="gallery-title">Recorded Videos</span>
        <span class="gallery-path">{{ directory }}</span>
      </div>
      <div class="view-switcher" aria-label="Gallery view">
        <button
          type="button"
          :class="{ active: viewMode === 'cards' }"
          @click="setViewMode('cards')"
        >Cards</button>
        <button
          type="button"
          :class="{ active: viewMode === 'calendar' }"
          @click="setViewMode('calendar')"
        >Calendar</button>
      </div>
    </div>
    <div v-if="videos.length === 0" class="no-videos">No videos found.</div>
    <template v-else>
      <div
        v-if="viewMode === 'calendar'"
        :class="['calendar-layout', { 'with-sidebar': displayedVideos.length > 1 }]"
      >
      <section class="calendar-view">
        <div v-for="month in calendarMonths" :key="month.key" class="calendar-month">
          <div class="calendar-month-sticky">
            <h2 class="calendar-month-title">{{ month.label }}</h2>
            <div class="calendar-weekdays" aria-hidden="true">
              <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
            </div>
          </div>
          <div class="calendar-grid">
            <div
              v-for="day in month.days"
              :key="day.key"
              :class="[
                'calendar-day',
                {
                  placeholder: day.placeholder,
                  today: day.isToday,
                  selected: selectedDate === day.key,
                  'has-videos': day.videoCount > 0,
                },
              ]"
            >
              <template v-if="!day.placeholder">
                <button
                  type="button"
                  class="calendar-day-select"
                  :aria-label="`${day.date.format('MMMM D, YYYY')}, ${day.videoCount} videos`"
                  @click="selectCalendarDay(day)"
                >
                  <span class="calendar-day-number">{{ day.date.date() }}</span>
                  <span v-if="day.videoCount" class="calendar-video-count">
                    {{ day.videoCount }} {{ day.videoCount === 1 ? 'video' : 'videos' }}
                  </span>
                </button>
                <div
                  v-if="day.videoCount"
                  :class="['calendar-thumbnails', { single: day.videoCount === 1 }]"
                >
                  <button
                    v-for="(video, index) in day.videos.slice(0, 2)"
                    :key="video.path"
                    type="button"
                    class="calendar-thumbnail"
                    :aria-label="`Play ${video.name}`"
                    :title="video.name"
                    @click="playVideo(video)"
                  >
                    <img
                      :src="getThumbnailUrl(video.path)"
                      loading="lazy"
                      alt=""
                      @error="handleThumbnailError"
                    />
                    <span v-if="index === 1 && day.videoCount > 2" class="calendar-more-count">
                      +{{ day.videoCount - 2 }}
                    </span>
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </section>

      <aside v-if="displayedVideos.length > 1" class="calendar-sidebar">
        <div class="calendar-sidebar-header">
          <div>
            <strong>{{ daySectionTitle }}</strong>
            <span>Based on local file creation time</span>
          </div>
          <button type="button" aria-label="Close video sidebar" @click="closeCalendarSidebar">×</button>
        </div>
        <div class="calendar-sidebar-list">
          <article v-for="video in displayedVideos" :key="video.path" class="sidebar-video-item">
            <div
              class="sidebar-video-thumbnail"
              role="button"
              tabindex="0"
              :aria-label="`Play ${video.name}`"
              @click="playVideo(video)"
              @keydown.enter.prevent="playVideo(video)"
              @keydown.space.prevent="playVideo(video)"
            >
              <img
                :src="getThumbnailUrl(video.path)"
                loading="lazy"
                alt="Video thumbnail"
                @error="handleThumbnailError"
              />
              <span class="sidebar-play-icon">▶</span>
            </div>
            <div class="sidebar-video-info">
              <form
                v-if="renamingPath === video.path"
                class="rename-form"
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
              <div v-else class="video-name" :title="video.name">{{ video.name }}</div>
              <div class="video-date-row">
                <div class="video-date">{{ formatDate(video.createdAt) }}</div>
                <div v-if="renamingPath !== video.path" class="video-menu" @click.stop>
                  <button
                    class="more-btn"
                    type="button"
                    aria-label="Video actions"
                    :aria-expanded="openMenuPath === video.path"
                    @click="toggleMenu(video.path)"
                  >···</button>
                  <div v-if="openMenuPath === video.path" class="video-menu-popover">
                    <button type="button" @click="startRename(video)">Rename</button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </aside>
      </div>

      <div v-if="viewMode === 'cards'" class="video-grid">
      <div v-for="video in displayedVideos" :key="video.path" class="video-item">
        <div
          class="video-thumbnail"
          role="button"
          tabindex="0"
          :aria-label="`Play ${video.name}`"
          @click="playVideo(video)"
          @keydown.enter.prevent="playVideo(video)"
          @keydown.space.prevent="playVideo(video)"
        >
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
          <div v-else class="video-name" :title="video.name">
            {{ video.name }}
          </div>
          <div class="video-date-row">
            <div class="video-date">{{ formatDate(video.createdAt) }}</div>
            <div v-if="renamingPath !== video.path" class="video-menu" @click.stop>
              <button
                class="more-btn"
                type="button"
                aria-label="Video actions"
                :aria-expanded="openMenuPath === video.path"
                @click="toggleMenu(video.path)"
              >···</button>
              <div v-if="openMenuPath === video.path" class="video-menu-popover">
                <button type="button" @click="startRename(video)">Rename</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </template>
    
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
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import dayjs from 'dayjs';

const props = defineProps({
  directory: String
});

const videos = ref([]);
const selectedVideo = ref(null);
const renamingPath = ref('');
const renameValue = ref('');
const renamePending = ref(false);
const openMenuPath = ref('');
const viewMode = ref('cards');
const selectedDate = ref('');
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let renameInput = null;

const videosByDate = computed(() => {
  const groupedVideos = new Map();
  videos.value.forEach((video) => {
    const dateKey = dayjs(video.createdAt).format('YYYY-MM-DD');
    const currentVideos = groupedVideos.get(dateKey) || [];
    currentVideos.push(video);
    groupedVideos.set(dateKey, currentVideos);
  });
  return groupedVideos;
});

const createMonthDays = (monthStart) => {
  const daysBeforeMonth = (monthStart.day() + 6) % 7;
  const daysInMonth = monthStart.daysInMonth();
  const cellCount = Math.ceil((daysBeforeMonth + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const dayNumber = index - daysBeforeMonth + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return {
        key: `${monthStart.format('YYYY-MM')}-placeholder-${index}`,
        placeholder: true,
        videoCount: 0,
      };
    }

    const date = monthStart.date(dayNumber);
    const dateKey = date.format('YYYY-MM-DD');
    const dayVideos = videosByDate.value.get(dateKey) || [];
    return {
      date,
      key: dateKey,
      placeholder: false,
      isToday: date.isSame(dayjs(), 'day'),
      videoCount: dayVideos.length,
      videos: dayVideos,
    };
  });
};

const calendarMonths = computed(() => {
  if (!videos.value.length) return [];

  const videoDates = videos.value.map((video) => dayjs(video.createdAt));
  const latestMonth = videoDates.reduce(
    (latest, date) => (date.isAfter(latest) ? date : latest),
    videoDates[0],
  ).startOf('month');
  const earliestMonth = videoDates.reduce(
    (earliest, date) => (date.isBefore(earliest) ? date : earliest),
    videoDates[0],
  ).startOf('month');

  const months = [];
  let month = latestMonth;
  while (month.isAfter(earliestMonth) || month.isSame(earliestMonth, 'month')) {
    months.push({
      key: month.format('YYYY-MM'),
      label: month.format('MMMM YYYY'),
      days: createMonthDays(month),
    });
    month = month.subtract(1, 'month');
  }
  return months;
});

const displayedVideos = computed(() => {
  if (viewMode.value === 'cards') return videos.value;
  return selectedDate.value ? videosByDate.value.get(selectedDate.value) || [] : [];
});

const daySectionTitle = computed(() => {
  const count = displayedVideos.value.length;
  return `${dayjs(selectedDate.value).format('MMMM D, YYYY')} · ${count} ${count === 1 ? 'video' : 'videos'}`;
});

const loadVideos = async (resetCalendar = false) => {
  if (props.directory) {
    videos.value = await window.electronAPI.getVideos(props.directory);
  } else {
    videos.value = [];
  }

  if (resetCalendar) {
    selectedDate.value = '';
  }
};

const setViewMode = (mode) => {
  viewMode.value = mode;
  openMenuPath.value = '';
  cancelRename();
};

const selectCalendarDay = (day) => {
  if (day.placeholder) return;
  selectedDate.value = day.key;
};

const closeCalendarSidebar = () => {
  selectedDate.value = '';
  openMenuPath.value = '';
  cancelRename();
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
    openMenuPath.value = '';
    selectedVideo.value = video;
};

const toggleMenu = (videoPath) => {
  openMenuPath.value = openMenuPath.value === videoPath ? '' : videoPath;
};

const closeVideoMenu = () => {
  openMenuPath.value = '';
};

const setRenameInput = (element) => {
  renameInput = element;
};

const startRename = async (video) => {
  openMenuPath.value = '';
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

watch(() => props.directory, () => loadVideos(true));
onMounted(() => {
  loadVideos(true);
  document.addEventListener('click', closeVideoMenu);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', closeVideoMenu);
});

defineExpose({ refresh: loadVideos });
</script>

<style scoped>
.gallery {
    width: 100%;
}

.gallery-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}

.gallery-heading {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.gallery-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #2c3e50;
}

.gallery-path {
  min-width: 0;
  font-size: 0.85rem;
  color: #7f8c8d;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.view-switcher {
  display: flex;
  flex-shrink: 0;
  padding: 3px;
  border: 1px solid #dce3e9;
  border-radius: 7px;
  background: #edf2f7;
}

.view-switcher button {
  padding: 6px 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #64748b;
  font-weight: 600;
  cursor: pointer;
}

.view-switcher button.active {
  background: white;
  color: #2c3e50;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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

.calendar-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 20px;
}

.calendar-layout.with-sidebar {
    grid-template-columns: minmax(0, 1fr) 300px;
}

.calendar-view {
    margin-bottom: 24px;
}

.calendar-sidebar {
    position: sticky;
    top: 0;
    max-height: calc(100vh - 60px);
    overflow: hidden;
    border: 1px solid #e1e7ec;
    border-radius: 10px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.calendar-sidebar-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 14px;
    border-bottom: 1px solid #e5e9ed;
}

.calendar-sidebar-header > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.calendar-sidebar-header strong {
    font-size: 0.9rem;
}

.calendar-sidebar-header span {
    color: #8a949d;
    font-size: 0.7rem;
}

.calendar-sidebar-header > button {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: #697784;
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
}

.calendar-sidebar-header > button:hover {
    background: #edf2f7;
}

.calendar-sidebar-list {
    max-height: calc(100vh - 135px);
    padding: 10px;
    overflow-y: auto;
}

.sidebar-video-item {
    overflow: hidden;
    border: 1px solid #e5e9ed;
    border-radius: 8px;
    background: white;
}

.sidebar-video-item + .sidebar-video-item {
    margin-top: 10px;
}

.sidebar-video-thumbnail {
    position: relative;
    height: 125px;
    overflow: hidden;
    background: #111;
    cursor: pointer;
}

.sidebar-video-thumbnail:focus-visible {
    outline: 3px solid #42b983;
    outline-offset: -3px;
}

.sidebar-video-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.sidebar-play-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    color: white;
    font-size: 1.5rem;
    opacity: 0.85;
    text-shadow: 0 0 8px rgba(0, 0, 0, 0.65);
    transform: translate(-50%, -50%);
}

.sidebar-video-info {
    padding: 10px;
}

.calendar-month + .calendar-month {
    margin-top: 36px;
}

.calendar-month-sticky {
    position: sticky;
    top: 0;
    z-index: 5;
    background: #f5f7fa;
}

.calendar-month-sticky::before {
    content: '';
    position: absolute;
    right: 0;
    bottom: 100%;
    left: 0;
    height: 30px;
    background: #f5f7fa;
    pointer-events: none;
}

.calendar-month-title {
    margin: 0 0 10px;
    padding: 11px 16px;
    border-left: 4px solid #42b983;
    border-radius: 6px;
    background: #e9eef2;
    color: #34495e;
    font-size: 1rem;
    font-weight: 700;
}

.calendar-weekdays,
.calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
}

.calendar-weekdays span {
    padding: 9px 6px;
    border-top: 1px solid #e5e9ed;
    color: #7f8c8d;
    background: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    text-align: center;
    text-transform: uppercase;
}

.calendar-weekdays span:first-child {
    border-left: 1px solid #e5e9ed;
    border-top-left-radius: 7px;
}

.calendar-weekdays span:last-child {
    border-right: 1px solid #e5e9ed;
    border-top-right-radius: 7px;
}

.calendar-grid {
    overflow: hidden;
    border-left: 1px solid #e5e9ed;
    border-radius: 0 0 7px 7px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.035);
}

.calendar-day {
    position: relative;
    min-width: 0;
    min-height: 126px;
    border-right: 1px solid #e5e9ed;
    border-bottom: 1px solid #e5e9ed;
    background: white;
    color: #34495e;
    overflow: hidden;
}

.calendar-day-select:hover {
    background: #f5faf8;
}

.calendar-day.placeholder {
    background: #fafbfc;
    cursor: default;
}

.calendar-day.selected {
    z-index: 1;
    background: #eaf8f2;
    box-shadow: inset 0 0 0 2px #42b983;
}

.calendar-day-select {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 7px;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
}

.calendar-day-number {
    display: inline-flex;
    width: 25px;
    height: 25px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 0.82rem;
    font-weight: 600;
}

.calendar-day.today .calendar-day-number {
    background: #42b983;
    color: white;
}

.calendar-video-count {
    padding: 4px 6px;
    overflow: hidden;
    border-radius: 4px;
    background: #edf8f3;
    color: #27845f;
    font-size: 0.72rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.calendar-thumbnails {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    padding: 0 7px 7px;
}

.calendar-thumbnails.single .calendar-thumbnail {
    grid-column: 1 / -1;
}

.calendar-thumbnail {
    position: relative;
    height: 65px;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: 5px;
    background: #1f2933;
    cursor: pointer;
}

.calendar-thumbnail:focus-visible {
    outline: 2px solid #42b983;
    outline-offset: -2px;
}

.calendar-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.calendar-more-count {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    color: white;
    font-size: 0.8rem;
    font-weight: 700;
}

@media (max-width: 600px) {
    .calendar-month-sticky::before {
        height: 15px;
    }

    .gallery-info,
    .gallery-heading {
        align-items: stretch;
        flex-direction: column;
    }

    .gallery-info {
        gap: 10px;
    }

    .view-switcher button {
        flex: 1;
    }

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

    .calendar-view {
        margin-bottom: 16px;
    }

    .calendar-layout.with-sidebar {
        grid-template-columns: 1fr;
    }

    .calendar-sidebar {
        position: static;
        max-height: none;
        grid-row: 1;
    }

    .calendar-sidebar-list {
        max-height: 55vh;
    }

    .calendar-month-title {
        font-size: 0.95rem;
    }

    .calendar-day {
        min-height: 82px;
    }

    .calendar-day-select {
        padding: 4px;
    }

    .calendar-video-count {
        width: 7px;
        height: 7px;
        margin: 4px auto 0;
        padding: 0;
        border-radius: 50%;
        color: transparent;
    }

    .calendar-thumbnails {
        grid-template-columns: 1fr;
        padding: 0 4px 4px;
    }

    .calendar-thumbnail {
        height: 38px;
    }

    .calendar-thumbnail:nth-child(2) {
        display: none;
    }

}

.video-item {
    background: #fff;
    border: 1px solid #eee;
    border-radius: 8px;
    overflow: hidden;
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
    cursor: pointer;
}
.video-thumbnail:focus-visible {
    outline: 3px solid #42b983;
    outline-offset: -3px;
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
.video-name {
    font-weight: 600;
    font-size: 0.9em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 5px;
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
}
.video-date-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 24px;
}
.video-menu {
    position: relative;
    flex-shrink: 0;
}
.more-btn {
    min-width: 28px;
    height: 24px;
    padding: 0 5px 5px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: #697784;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
}
.more-btn:hover,
.more-btn[aria-expanded="true"] {
    background: #edf2f7;
    color: #2c3e50;
}
.video-menu-popover {
    position: absolute;
    right: 0;
    bottom: calc(100% + 4px);
    z-index: 10;
    min-width: 110px;
    padding: 4px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
}
.video-menu-popover button {
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #2c3e50;
    text-align: left;
    cursor: pointer;
}
.video-menu-popover button:hover {
    background: #edf2f7;
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
