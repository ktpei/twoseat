const views = {
  disconnected: document.getElementById('view-disconnected'),
  offering: document.getElementById('view-offering'),
  answering: document.getElementById('view-answering'),
  connected: document.getElementById('view-connected'),
  error: document.getElementById('view-error'),
};
const statusEl = document.getElementById('status');
const videoInfoEl = document.getElementById('video-info');

// Show what video we're listening to + peer match status
chrome.storage.session.get(['hasVideo', 'videoTitle', 'peerTitle', 'urlMatch', 'connectionState'], (data) => {
  if (data.hasVideo && data.videoTitle) {
    videoInfoEl.innerHTML = 'Listening to: ' + data.videoTitle;
    if (data.connectionState === 'connected' && data.peerTitle != null) {
      const matchEl = document.createElement('div');
      matchEl.id = 'peer-info';
      if (data.urlMatch) {
        matchEl.className = 'peer-match';
        matchEl.textContent = 'Partner is on the same video';
      } else {
        matchEl.className = 'peer-mismatch';
        matchEl.textContent = 'Partner is on: ' + data.peerTitle;
      }
      videoInfoEl.after(matchEl);
    }
  } else {
    videoInfoEl.textContent = 'No video detected on active tab';
  }
});

function showView(name) {
  Object.values(views).forEach((v) => (v.hidden = true));
  views[name].hidden = false;
}

function setStatus(text, loading) {
  statusEl.innerHTML = loading
    ? '<span class="spinner"></span>' + text
    : text;
}

function validateSdp(input) {
  if (!input) return false;
  try {
    const parsed = JSON.parse(atob(input));
    return parsed && parsed.type && parsed.sdp;
  } catch (e) {
    return false;
  }
}

function showValidationError(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.hidden = false;
}

function clearValidationError(id) {
  const el = document.getElementById(id);
  el.hidden = true;
}

// Restore state on popup open
chrome.storage.session.get(
  ['connectionState', 'pendingOffer', 'pendingAnswer', 'role', 'connectionError'],
  (data) => {
    if (data.connectionState === 'connected') {
      showView('connected');
      return;
    }
    if (data.connectionState === 'failed') {
      showError(data.connectionError);
      return;
    }
    if (data.role === 'answerer') {
      showView('answering');
      if (data.pendingAnswer) {
        document.getElementById('answer-text').value = data.pendingAnswer;
        document.getElementById('answer-section').hidden = false;
        setStatus('Response ready — copy and send it back.', false);
      }
    } else if (data.pendingOffer) {
      document.getElementById('offer-text').value = data.pendingOffer;
      showView('offering');
      setStatus('Room code ready — copy and send it.', false);
    }
  }
);

function clearSignalingState(callback) {
  chrome.storage.session.remove([
    'connectionState', 'connectionError', 'pendingOffer',
    'pendingAnswer', 'role',
  ], callback);
}

// Create Room (User A)
document.getElementById('btn-create').addEventListener('click', () => {
  clearSignalingState(() => {
    chrome.storage.session.set({ role: 'offerer' });
    chrome.runtime.sendMessage({ type: TWOSEAT.MSG.CREATE_OFFER });
  });
  showView('offering');
  setStatus('Generating room code...', true);
});

// Join Room (User B)
document.getElementById('btn-join').addEventListener('click', () => {
  clearSignalingState(() => {
    chrome.storage.session.set({ role: 'answerer' });
  });
  showView('answering');
  setStatus('', false);
});

// Accept Offer (User B pastes offer, clicks generate)
document.getElementById('btn-accept-offer').addEventListener('click', () => {
  const sdp = document.getElementById('offer-input').value.trim();
  clearValidationError('offer-input-error');
  document.getElementById('offer-input').classList.remove('invalid');

  if (!sdp) return;
  if (!validateSdp(sdp)) {
    document.getElementById('offer-input').classList.add('invalid');
    showValidationError('offer-input-error', 'Invalid code — make sure you copied the full text.');
    return;
  }

  chrome.runtime.sendMessage({ type: TWOSEAT.MSG.ACCEPT_OFFER, sdp });
  setStatus('Generating response...', true);
});

// Set Answer (User A pastes answer, clicks connect)
document.getElementById('btn-set-answer').addEventListener('click', () => {
  const sdp = document.getElementById('answer-input').value.trim();
  clearValidationError('answer-input-error');
  document.getElementById('answer-input').classList.remove('invalid');

  if (!sdp) return;
  if (!validateSdp(sdp)) {
    document.getElementById('answer-input').classList.add('invalid');
    showValidationError('answer-input-error', 'Invalid code — make sure you copied the full text.');
    return;
  }

  chrome.runtime.sendMessage({ type: TWOSEAT.MSG.SET_ANSWER, sdp });
  setStatus('Connecting...', true);
});

// Clear validation on input
document.getElementById('offer-input').addEventListener('input', () => {
  clearValidationError('offer-input-error');
  document.getElementById('offer-input').classList.remove('invalid');
});
document.getElementById('answer-input').addEventListener('input', () => {
  clearValidationError('answer-input-error');
  document.getElementById('answer-input').classList.remove('invalid');
});

// Copy buttons
document.getElementById('btn-copy-offer').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('offer-text').value);
  document.getElementById('btn-copy-offer').textContent = 'Copied!';
  setTimeout(() => {
    document.getElementById('btn-copy-offer').textContent = 'Copy';
  }, 1500);
});

document.getElementById('btn-copy-answer').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('answer-text').value);
  document.getElementById('btn-copy-answer').textContent = 'Copied!';
  setTimeout(() => {
    document.getElementById('btn-copy-answer').textContent = 'Copy';
  }, 1500);
});

// Auto-follow toggle
const autoFollowToggle = document.getElementById('toggle-autofollow');
chrome.storage.session.get('autoFollow', (data) => {
  autoFollowToggle.checked = !!data.autoFollow;
});
autoFollowToggle.addEventListener('change', () => {
  chrome.storage.session.set({ autoFollow: autoFollowToggle.checked });
});

// Disconnect with confirmation
let disconnectPending = false;
let disconnectTimer = null;
document.getElementById('btn-disconnect').addEventListener('click', () => {
  const btn = document.getElementById('btn-disconnect');
  if (!disconnectPending) {
    disconnectPending = true;
    btn.textContent = 'Click again to confirm';
    btn.classList.add('confirm');
    disconnectTimer = setTimeout(() => {
      disconnectPending = false;
      btn.textContent = 'Disconnect';
      btn.classList.remove('confirm');
    }, 2000);
    return;
  }
  clearTimeout(disconnectTimer);
  disconnectPending = false;
  chrome.runtime.sendMessage({ type: TWOSEAT.MSG.DISCONNECT });
  clearSignalingState();
  showView('disconnected');
  setStatus('', false);
});

// Error view
function showError(errorMsg) {
  const text = errorMsg || 'Something went wrong';
  document.getElementById('error-text').textContent =
    'Connection failed — ' + text;
  showView('error');
  setStatus('', false);
}

document.getElementById('btn-retry').addEventListener('click', () => {
  clearSignalingState();
  showView('disconnected');
  setStatus('', false);
});

// Poll storage for async results
const pollInterval = setInterval(() => {
  chrome.storage.session.get(
    ['pendingOffer', 'pendingAnswer', 'connectionState', 'connectionError', 'urlMatch', 'peerTitle'],
    (data) => {
      if (data.pendingOffer && views.offering.hidden === false) {
        const el = document.getElementById('offer-text');
        if (!el.value) {
          el.value = data.pendingOffer;
          setStatus('Room code ready — copy and send it.', false);
        }
      }
      if (data.pendingAnswer) {
        const el = document.getElementById('answer-text');
        if (!el.value) {
          el.value = data.pendingAnswer;
          document.getElementById('answer-section').hidden = false;
          if (views.answering.hidden === false) {
            setStatus('Response ready — copy and send it back.', false);
          }
        }
      }
      if (data.connectionState === 'connected') {
        showView('connected');
        setStatus('', false);
      }
      if (data.connectionState === 'failed' && views.error.hidden) {
        showError(data.connectionError);
      }
      // Update sync-paused state when connected
      if (data.connectionState === 'connected') {
        const pausedEl = document.getElementById('sync-paused');
        const pausedText = document.getElementById('sync-paused-text');
        const connText = document.getElementById('connected-text');
        if (data.urlMatch === false && data.peerTitle) {
          pausedEl.hidden = false;
          pausedText.textContent = 'Sync paused — Partner is on: ' + data.peerTitle;
          connText.textContent = 'Connected';
        } else {
          pausedEl.hidden = true;
          connText.textContent = 'Connected — videos are syncing';
        }
      }
    }
  );
}, 500);
