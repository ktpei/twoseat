let video = null;
let suppressCount = 0;
let syncInterval = null;
let indicatorEl = null;
let indicatorTimeout = null;
let presenceDot = null;
let followBanner = null;
let urlMatched = true;
let isConnected = false;

// --- On-page sync indicator ---
function createIndicator() {
  if (indicatorEl) return;
  indicatorEl = document.createElement('div');
  indicatorEl.id = 'twoseat-indicator';
  indicatorEl.style.cssText = [
    'position: fixed',
    'bottom: 16px',
    'right: 40px',
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

// --- Presence dot ---
function showPresenceDot() {
  if (presenceDot) return;
  presenceDot = document.createElement('div');
  presenceDot.id = 'twoseat-presence';
  presenceDot.style.cssText = [
    'position: fixed',
    'bottom: 20px',
    'right: 20px',
    'width: 8px',
    'height: 8px',
    'border-radius: 50%',
    'background: #22C55E',
    'z-index: 2147483647',
    'pointer-events: none',
    'transition: background 0.3s',
  ].join(';');
  document.body.appendChild(presenceDot);
}

function hidePresenceDot() {
  if (presenceDot) {
    presenceDot.remove();
    presenceDot = null;
  }
}

function setPresenceColor(color) {
  if (presenceDot) presenceDot.style.background = color;
}

// --- Follow banner ---
function showFollowBanner(url, title) {
  removeFollowBanner();
  followBanner = document.createElement('div');
  followBanner.id = 'twoseat-follow-banner';
  followBanner.style.cssText = [
    'position: fixed',
    'top: 8px',
    'left: 50%',
    'transform: translateX(-50%)',
    'background: rgba(0,0,0,0.9)',
    'color: #fff',
    'padding: 12px 16px',
    'border-radius: 10px',
    'font: 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif',
    'z-index: 2147483647',
    'max-width: 500px',
    'box-shadow: 0 4px 20px rgba(0,0,0,0.3)',
  ].join(';');

  const label = document.createElement('div');
  label.style.cssText = 'margin-bottom: 8px; color: #aaa; font-size: 11px;';
  label.textContent = 'Partner went to:';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'margin-bottom: 10px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
  titleEl.textContent = title;

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: 8px;';

  const followBtn = document.createElement('button');
  followBtn.textContent = 'Follow';
  followBtn.style.cssText = 'flex: 1; padding: 6px 12px; border: none; border-radius: 6px; background: #22C55E; color: #fff; font-size: 13px; cursor: pointer;';
  followBtn.addEventListener('click', () => {
    removeFollowBanner();
    window.location.href = url;
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.style.cssText = 'flex: 1; padding: 6px 12px; border: 1px solid #555; border-radius: 6px; background: transparent; color: #fff; font-size: 13px; cursor: pointer;';
  dismissBtn.addEventListener('click', () => {
    removeFollowBanner();
  });

  btnRow.appendChild(followBtn);
  btnRow.appendChild(dismissBtn);
  followBanner.appendChild(label);
  followBanner.appendChild(titleEl);
  followBanner.appendChild(btnRow);
  document.body.appendChild(followBanner);
}

function removeFollowBanner() {
  if (followBanner) {
    followBanner.remove();
    followBanner = null;
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
  if (!urlMatched && [TWOSEAT.ACTION.PLAY, TWOSEAT.ACTION.PAUSE, TWOSEAT.ACTION.SEEK, TWOSEAT.ACTION.SYNC].includes(action)) {
    return; // Don't send sync commands when on different videos
  }
  const control = {
    action,
    time: video ? video.currentTime : 0,
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

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function handleVideoCommand(control) {
  if (!video) return;

  // Gate sync commands when on different videos
  if (!urlMatched && [TWOSEAT.ACTION.PLAY, TWOSEAT.ACTION.PAUSE, TWOSEAT.ACTION.SEEK, TWOSEAT.ACTION.SYNC].includes(control.action)) {
    return;
  }

  suppressCount++;

  try {
    const latency = (Date.now() - control.sentAt) / 1000;
    const compensatedTime = control.time + latency;

    switch (control.action) {
      case TWOSEAT.ACTION.PLAY:
        showIndicator('Partner played', '#666', 2000);
        video.currentTime = compensatedTime;
        video.play();
        break;

      case TWOSEAT.ACTION.PAUSE:
        showIndicator('Partner paused', '#666', 2000);
        video.currentTime = control.time;
        video.pause();
        break;

      case TWOSEAT.ACTION.SEEK:
        showIndicator('Partner seeked to ' + formatTime(control.time), '#666', 2000);
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
  syncTickCount = 0;
  syncInterval = setInterval(() => {
    syncTickCount++;
    // Re-send URL info every 5 ticks (5 seconds) as fallback
    if (syncTickCount % 5 === 0) {
      sendUrlInfo();
    }
    if (suppressCount === 0 && video && !video.paused && urlMatched) {
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

function sendNavEvent() {
  if (!isConnected) return;
  sendVideoEvent(TWOSEAT.ACTION.NAV, {
    url: window.location.href,
    pageTitle: document.title,
  });
}

function handleUrlInfo(control) {
  const myUrl = getVideoUrl();
  const peerUrl = control.url;
  const match = myUrl === peerUrl;
  urlMatched = match;

  try {
    chrome.runtime.sendMessage({
      type: 'twoseat:peer-url',
      peerUrl: peerUrl,
      peerTitle: control.pageTitle,
      urlMatch: match,
    });
  } catch (e) {}

  if (!match) {
    showIndicator('Sync paused — different video', '#EAB308', 4000);
  } else {
    showIndicator('Syncing', '#22C55E', 2000);
  }
}

function handleNav(control) {
  // Check if auto-follow is enabled
  try {
    chrome.storage.session.get('autoFollow', (data) => {
      if (data.autoFollow) {
        window.location.href = control.url;
      } else {
        showFollowBanner(control.url, control.pageTitle);
      }
    });
  } catch (e) {
    showFollowBanner(control.url, control.pageTitle);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case TWOSEAT.MSG.VIDEO_COMMAND:
      if (message.control.action === TWOSEAT.ACTION.URL_INFO) {
        handleUrlInfo(message.control);
      } else if (message.control.action === TWOSEAT.ACTION.NAV) {
        handleNav(message.control);
      } else {
        handleVideoCommand(message.control);
      }
      break;
    case TWOSEAT.MSG.SYNC_TICK:
      if (message.enabled) {
        isConnected = true;
        startSyncTicker();
        sendUrlInfo();
        sendNavEvent();
        showPresenceDot();
        showIndicator('Partner is here', '#22C55E', 3000);
      } else {
        stopSyncTicker();
      }
      break;
    case TWOSEAT.MSG.DISCONNECT:
      isConnected = false;
      urlMatched = true;
      stopSyncTicker();
      if (video) video.playbackRate = 1.0;
      setPresenceColor('#888');
      showIndicator('Partner disconnected', '#EF4444', 3000);
      setTimeout(hidePresenceDot, 3000);
      removeFollowBanner();
      break;
    case 'twoseat:status':
      if (message.status === 'syncing') {
        isConnected = true;
        showPresenceDot();
        showIndicator('Syncing', '#22C55E', 3000);
      } else if (message.status === 'disconnected') {
        isConnected = false;
        setPresenceColor('#888');
        showIndicator('Partner disconnected', '#EF4444', 3000);
        setTimeout(hidePresenceDot, 3000);
      }
      break;
  }
});

let lastAttachedVideo = null;

function init() {
  video = findVideo();
  if (!video) {
    const observer = new MutationObserver(() => {
      video = findVideo();
      if (video) {
        observer.disconnect();
        onVideoFound();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[TwoSeat] No video found, watching for one...');
    return;
  }
  onVideoFound();
}

function onVideoFound() {
  // Only re-attach listeners if the video element changed
  if (video !== lastAttachedVideo) {
    attachListeners();
    lastAttachedVideo = video;
  }
  console.log('[TwoSeat] Video found');
  showIndicator('TwoSeat: Watching', '#666', 2000);
  try {
    chrome.runtime.sendMessage({ type: TWOSEAT.MSG.VIDEO_FOUND, title: document.title });
  } catch (e) {}
  if (isConnected) {
    sendNavEvent();
    sendUrlInfo();
  }
}

// --- SPA navigation detection ---
let lastUrl = window.location.href;
let syncTickCount = 0;

function onNavigated() {
  console.log('[TwoSeat] SPA navigation detected:', window.location.href);
  // Re-detect video (may be the same element with different source)
  video = findVideo();
  if (video) {
    onVideoFound();
  }
}

// Poll for URL changes (catches all SPA navigations)
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    onNavigated();
  }
}, 1000);

// YouTube-specific: fires immediately on SPA navigation
document.addEventListener('yt-navigate-finish', () => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    onNavigated();
  }
});

init();
