importScripts('lib/protocol.js');

// Inject content script into existing tabs on install/reload
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['lib/protocol.js', 'content-script.js'],
        }).catch(() => {});
      }
    }
  });
});

let offscreenReady = false;
let offscreenReadyResolvers = [];

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) {
    return;
  }

  offscreenReady = false;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WEB_RTC'],
    justification: 'Maintain WebRTC DataChannel for P2P video sync',
  });

  if (!offscreenReady) {
    await new Promise((resolve) => {
      offscreenReadyResolvers.push(resolve);
      setTimeout(resolve, 1000);
    });
  }

  console.log('[TwoSeat] offscreen ready');
}

function sendToOffscreen(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function notifyActiveTab(message) {
  const data = await chrome.storage.session.get('tabId');
  if (data.tabId) {
    try {
      await chrome.tabs.sendMessage(data.tabId, message);
    } catch (e) {
      // Tab may have been closed or navigated
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || !message.type) return;

  switch (message.type) {
    // === Offscreen ready handshake ===
    case 'twoseat:offscreen-ready':
      console.log('[TwoSeat] offscreen-ready received');
      offscreenReady = true;
      offscreenReadyResolvers.forEach((r) => r());
      offscreenReadyResolvers = [];
      break;

    // === From Popup ===
    case TWOSEAT.MSG.CREATE_OFFER:
      console.log('[TwoSeat] CREATE_OFFER');
      setBadge('...', '#EAB308');
      ensureOffscreen().then(() => {
        sendToOffscreen({ type: TWOSEAT.MSG.RTC_CREATE_OFFER });
      });
      break;

    case TWOSEAT.MSG.ACCEPT_OFFER:
      console.log('[TwoSeat] ACCEPT_OFFER');
      setBadge('...', '#EAB308');
      ensureOffscreen().then(() => {
        sendToOffscreen({
          type: TWOSEAT.MSG.RTC_ACCEPT_OFFER,
          sdp: message.sdp,
        });
      });
      break;

    case TWOSEAT.MSG.SET_ANSWER:
      console.log('[TwoSeat] SET_ANSWER');
      setBadge('...', '#EAB308');
      ensureOffscreen().then(() => {
        sendToOffscreen({
          type: TWOSEAT.MSG.RTC_SET_ANSWER,
          sdp: message.sdp,
        });
      });
      break;

    // === From Offscreen ===
    case TWOSEAT.MSG.RTC_OFFER_READY:
      console.log('[TwoSeat] offer ready, storing');
      chrome.storage.session.set({ pendingOffer: message.sdp });
      setBadge('', '');
      break;

    case TWOSEAT.MSG.RTC_ANSWER_READY:
      console.log('[TwoSeat] answer ready, storing');
      chrome.storage.session.set({ pendingAnswer: message.sdp });
      setBadge('', '');
      break;

    case TWOSEAT.MSG.RTC_STATE_CHANGE:
      console.log('[TwoSeat] state change:', message.state, message.error || '');
      chrome.storage.session.set({
        connectionState: message.state,
        connectionError: message.error || null,
      });
      if (message.state === 'connected') {
        setBadge(' ', '#22C55E');
        notifyActiveTab({ type: TWOSEAT.MSG.SYNC_TICK, enabled: true });
        notifyActiveTab({ type: 'twoseat:status', status: 'syncing' });
      } else if (message.state === 'disconnected' || message.state === 'failed') {
        setBadge(message.state === 'failed' ? '!' : '', message.state === 'failed' ? '#EF4444' : '');
        notifyActiveTab({ type: TWOSEAT.MSG.DISCONNECT });
        notifyActiveTab({ type: 'twoseat:status', status: 'disconnected' });
      }
      break;

    case TWOSEAT.MSG.RTC_DATA_IN:
      notifyActiveTab({
        type: TWOSEAT.MSG.VIDEO_COMMAND,
        control: message.data,
      });
      break;

    // === From Content Script ===
    case TWOSEAT.MSG.VIDEO_EVENT:
      sendToOffscreen({
        type: TWOSEAT.MSG.RTC_DATA_OUT,
        data: message.control,
      });
      break;

    case TWOSEAT.MSG.VIDEO_FOUND:
      if (sender.tab) {
        chrome.storage.session.set({
          hasVideo: true,
          tabId: sender.tab.id,
          videoTitle: message.title || 'Unknown video',
        });
      }
      break;

    case 'twoseat:peer-url':
      chrome.storage.session.set({
        peerUrl: message.peerUrl,
        peerTitle: message.peerTitle,
        urlMatch: message.urlMatch,
      });
      break;

    // === Disconnect ===
    case TWOSEAT.MSG.DISCONNECT:
      sendToOffscreen({ type: TWOSEAT.MSG.DISCONNECT });
      chrome.storage.session.set({ connectionState: 'disconnected' });
      setBadge('', '');
      notifyActiveTab({ type: TWOSEAT.MSG.DISCONNECT });
      notifyActiveTab({ type: 'twoseat:status', status: 'disconnected' });
      break;
  }
});
