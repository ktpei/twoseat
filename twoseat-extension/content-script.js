let video = null;
let suppressCount = 0;
let syncInterval = null;
let indicatorEl = null;
let indicatorTimeout = null;

// --- On-page sync indicator ---
function createIndicator() {
  if (indicatorEl) return;
  indicatorEl = document.createElement('div');
  indicatorEl.id = 'twoseat-indicator';
  indicatorEl.style.cssText = [
    'position: fixed',
    'bottom: 16px',
    'right: 16px',
    'padding: 4px 10px',
    'border-radius: 12px',
    'font: 11px/1.4 -apple-system, BlinkMacSystemFont, sans-serif',
    'color: #fff',
    'z-index: 2147483647',
    'pointer-events: none',
    'transition: opacity 0.3s',
    'opacity: 0',
  ].join(';');
  document.body.appendChild(indicatorEl);
}

function showIndicator(text, bg, duration) {
  createIndicator();
  indicatorEl.textContent = text;
  indicatorEl.style.background = bg;
  indicatorEl.style.opacity = '0.85';
  clearTimeout(indicatorTimeout);
  if (duration) {
    indicatorTimeout = setTimeout(() => {
      indicatorEl.style.opacity = '0';
    }, duration);
  }
}

// --- Video detection ---
function findVideo() {
  const videos = Array.from(document.querySelectorAll('video'));
  if (videos.length === 0) return null;
  return videos.reduce((best, v) => {
    const area = v.clientWidth * v.clientHeight;
    const bestArea = best.clientWidth * best.clientHeight;
    return area > bestArea ? v : best;
  });
}

function sendVideoEvent(action, payload = {}) {
  const control = {
    action,
    time: video.currentTime,
    sentAt: Date.now(),
    ...payload,
  };
  try {
    chrome.runtime.sendMessage({
      type: TWOSEAT.MSG.VIDEO_EVENT,
      control,
    });
  } catch (e) {
    // Extension context invalidated
  }
}

function attachListeners() {
  console.log('[TwoSeat] Video listeners attached');
  video.addEventListener('play', () => {
    if (suppressCount > 0) return;
    sendVideoEvent(TWOSEAT.ACTION.PLAY);
  });

  video.addEventListener('pause', () => {
    if (suppressCount > 0) return;
    sendVideoEvent(TWOSEAT.ACTION.PAUSE);
  });

  video.addEventListener('seeking', () => {
    if (suppressCount > 0) return;
    sendVideoEvent(TWOSEAT.ACTION.SEEK, { targetTime: video.currentTime });
  });
}

function handleVideoCommand(control) {
  if (!video) return;
  suppressCount++;

  try {
    const latency = (Date.now() - control.sentAt) / 1000;
    const compensatedTime = control.time + latency;

    switch (control.action) {
      case TWOSEAT.ACTION.PLAY:
        video.currentTime = compensatedTime;
        video.play();
        break;

      case TWOSEAT.ACTION.PAUSE:
        video.currentTime = control.time;
        video.pause();
        break;

      case TWOSEAT.ACTION.SEEK:
        video.currentTime = control.time;
        break;

      case TWOSEAT.ACTION.SYNC: {
        const drift = compensatedTime - video.currentTime;

        if (Math.abs(drift) > TWOSEAT.DRIFT.JUMP_THRESHOLD) {
          video.currentTime = compensatedTime;
          video.playbackRate = 1.0;
        } else if (Math.abs(drift) > TWOSEAT.DRIFT.ADJUST_THRESHOLD) {
          video.playbackRate = 1.0 + (drift * TWOSEAT.DRIFT.RATE_FACTOR);
          video.playbackRate = Math.max(
            TWOSEAT.DRIFT.RATE_MIN,
            Math.min(TWOSEAT.DRIFT.RATE_MAX, video.playbackRate)
          );
        } else {
          video.playbackRate = 1.0;
        }
        break;
      }
    }
  } catch (e) {
    console.error('[TwoSeat] Failed to handle command:', e);
  } finally {
    setTimeout(() => {
      suppressCount = Math.max(0, suppressCount - 1);
    }, 100);
  }
}

function startSyncTicker() {
  if (syncInterval) return;
  syncInterval = setInterval(() => {
    if (suppressCount === 0 && video && !video.paused) {
      sendVideoEvent(TWOSEAT.ACTION.SYNC);
    }
  }, TWOSEAT.SYNC_INTERVAL_MS);
}

function stopSyncTicker() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

function getVideoUrl() {
  // For YouTube, normalize to just the video ID
  const url = new URL(window.location.href);
  if (url.hostname.includes('youtube.com') && url.searchParams.has('v')) {
    return 'https://www.youtube.com/watch?v=' + url.searchParams.get('v');
  }
  return url.origin + url.pathname;
}

function sendUrlInfo() {
  sendVideoEvent(TWOSEAT.ACTION.URL_INFO, {
    url: getVideoUrl(),
    pageTitle: document.title,
  });
}

function handleUrlInfo(control) {
  const myUrl = getVideoUrl();
  const peerUrl = control.url;
  const match = myUrl === peerUrl;

  try {
    chrome.runtime.sendMessage({
      type: 'twoseat:peer-url',
      peerUrl: peerUrl,
      peerTitle: control.pageTitle,
      urlMatch: match,
    });
  } catch (e) {}

  if (!match) {
    showIndicator('TwoSeat: Different video!', '#EAB308', 5000);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case TWOSEAT.MSG.VIDEO_COMMAND:
      if (message.control.action === TWOSEAT.ACTION.URL_INFO) {
        handleUrlInfo(message.control);
      } else {
        handleVideoCommand(message.control);
      }
      break;
    case TWOSEAT.MSG.SYNC_TICK:
      if (message.enabled) {
        startSyncTicker();
        sendUrlInfo();
        showIndicator('TwoSeat: Syncing', '#22C55E', 3000);
      } else {
        stopSyncTicker();
      }
      break;
    case TWOSEAT.MSG.DISCONNECT:
      stopSyncTicker();
      if (video) video.playbackRate = 1.0;
      showIndicator('TwoSeat: Disconnected', '#EF4444', 3000);
      break;
    case 'twoseat:status':
      if (message.status === 'syncing') {
        showIndicator('TwoSeat: Syncing', '#22C55E', 3000);
      } else if (message.status === 'disconnected') {
        showIndicator('TwoSeat: Disconnected', '#EF4444', 3000);
      }
      break;
  }
});

function init() {
  video = findVideo();
  if (!video) {
    const observer = new MutationObserver(() => {
      video = findVideo();
      if (video) {
        observer.disconnect();
        attachListeners();
        showIndicator('TwoSeat: Watching', '#666', 2000);
        try {
          chrome.runtime.sendMessage({ type: TWOSEAT.MSG.VIDEO_FOUND, title: document.title });
        } catch (e) {}
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[TwoSeat] No video found, watching for one...');
    return;
  }
  console.log('[TwoSeat] Video found');
  attachListeners();
  showIndicator('TwoSeat: Watching', '#666', 2000);
  try {
    chrome.runtime.sendMessage({ type: TWOSEAT.MSG.VIDEO_FOUND, title: document.title });
  } catch (e) {}
}

init();
