// One queue per notes view. Stop invalidates every asynchronous continuation.
export function createReadingPlayer({ request, cancel, createAudio, createUrl, revokeUrl, update }) {
  let generation = 0, audio = null, url = null, pending = null, requestId = null;
  let paused = false, resumeWait = null, rate = 1;
  function release() {
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
    if (url) { revokeUrl(url); url = null; }
  }
  function stop() {
    generation++;
    if (requestId) cancel(requestId).catch(() => {});
    requestId = null; paused = false; resumeWait?.(); resumeWait = null;
    release(); update({ state: 'idle', topic: null, position: 0, total: 0 });
  }
  async function start(chunks, context) {
    stop(); const run = generation;
    // A previous cancelled IPC must settle before issuing another paid request.
    if (pending) await pending.catch(() => {});
    if (run !== generation) return;
    try {
      for (let index = 0; index < chunks.length; index++) {
        if (run !== generation) return;
        update({ state: 'loading', topic: chunks[index].topic, position: index + 1, total: chunks.length });
        requestId = crypto.randomUUID();
        pending = request({ ...context, index, requestId });
        const result = await pending;
        if (run !== generation) return;
        requestId = null;
        release(); url = createUrl(result.audio); audio = createAudio(url); audio.playbackRate = rate;
        if (paused) { update({ state: 'paused' }); await new Promise(resolve => { resumeWait = resolve; }); }
        if (run !== generation) return;
        const current = audio;
        // End/error handlers are installed before play, including very short clips.
        await new Promise((resolve, reject) => {
          current.onended = resolve;
          current.onerror = () => reject(new Error('朗读音频无法播放，请手动重试。'));
          update({ state: 'playing' });
          current.play().catch(reject);
          // Stopping also resolves this segment's wait.
          resumeWait = resolve;
        });
      }
      if (run === generation) { release(); update({ state: 'idle', topic: null, position: 0, total: 0 }); }
    } catch (error) {
      if (run === generation) { release(); update({ state: 'error', topic: null, error: error.message }); }
    }
  }
  function pause() { paused = true; audio?.pause(); update({ state: 'paused' }); }
  async function resume() {
    paused = false;
    if (audio?.onended) {
      const current = audio, run = generation;
      try { await current.play(); if (run === generation && current === audio) update({ state: 'playing' }); }
      catch { if (run === generation) { stop(); update({ state: 'error', topic: null, error: '播放失败，请重新朗读。' }); } }
    } else if (resumeWait) { const next = resumeWait; resumeWait = null; next(); }
    else update({ state: 'loading' });
  }
  return { start, stop, pause, resume, setRate(value) { rate = value; if (audio) audio.playbackRate = value; } };
}
