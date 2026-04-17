let pc = null;
let dc = null;

// Signal to service worker that offscreen is ready
chrome.runtime.sendMessage({ type: 'twoseat:offscreen-ready' }).catch(() => {});

function createPeerConnection() {
  if (pc) {
    pc.close();
  }
  pc = new RTCPeerConnection({
    iceServers: TWOSEAT.STUN_SERVERS,
  });

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    console.log('[TwoSeat] ICE connection state:', state);
    // Only report failure/disconnect from ICE. "connected" comes from DataChannel open.
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      chrome.runtime.sendMessage({
        type: TWOSEAT.MSG.RTC_STATE_CHANGE,
        state: state === 'closed' ? 'disconnected' : state,
      }).catch(() => {});
    }
  };
}

function waitForIceComplete(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      }
    };
    setTimeout(resolve, 5000);
  });
}

function attachDataChannelListeners(channel) {
  channel.onopen = () => {
    console.log('[TwoSeat] DataChannel opened');
    chrome.runtime.sendMessage({
      type: TWOSEAT.MSG.RTC_STATE_CHANGE,
      state: 'connected',
    }).catch(() => {});
  };

  channel.onclose = () => {
    console.log('[TwoSeat] DataChannel closed');
    chrome.runtime.sendMessage({
      type: TWOSEAT.MSG.RTC_STATE_CHANGE,
      state: 'disconnected',
    }).catch(() => {});
  };

  channel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      chrome.runtime.sendMessage({
        type: TWOSEAT.MSG.RTC_DATA_IN,
        data: data,
      }).catch(() => {});
    } catch (e) {
      console.error('[TwoSeat] Failed to parse peer message:', e);
    }
  };
}

function sendToPeer(data) {
  if (dc && dc.readyState === 'open') {
    dc.send(JSON.stringify(data));
  }
}

async function createOffer() {
  console.log('[TwoSeat] Creating offer');
  createPeerConnection();

  dc = pc.createDataChannel('twoseat-sync');
  attachDataChannelListeners(dc);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.log('[TwoSeat] Waiting for ICE gathering...');
  await waitForIceComplete(pc);
  console.log('[TwoSeat] ICE gathering complete');

  const fullSdp = btoa(JSON.stringify(pc.localDescription));
  chrome.runtime.sendMessage({
    type: TWOSEAT.MSG.RTC_OFFER_READY,
    sdp: fullSdp,
  }).catch(() => {});
}

async function acceptOffer(encodedSdp) {
  console.log('[TwoSeat] Accepting offer');
  createPeerConnection();

  pc.ondatachannel = (event) => {
    dc = event.channel;
    attachDataChannelListeners(dc);
  };

  const offer = JSON.parse(atob(encodedSdp));
  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  console.log('[TwoSeat] Waiting for ICE gathering (answer)...');
  await waitForIceComplete(pc);
  console.log('[TwoSeat] ICE gathering complete (answer)');

  const fullSdp = btoa(JSON.stringify(pc.localDescription));
  console.log('[TwoSeat] Sending answer ready, length:', fullSdp.length);
  chrome.runtime.sendMessage({
    type: TWOSEAT.MSG.RTC_ANSWER_READY,
    sdp: fullSdp,
  }).catch(() => {});
}

async function setAnswer(encodedSdp) {
  if (!pc || pc.signalingState !== 'have-local-offer') {
    console.error('[TwoSeat] PC not ready for answer, state:', pc ? pc.signalingState : 'null');
    throw new Error('Room expired — please create a new room and try again');
  }
  console.log('[TwoSeat] Setting answer');
  const answer = JSON.parse(atob(encodedSdp));
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

function cleanup() {
  if (dc) {
    dc.close();
    dc = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
}

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case TWOSEAT.MSG.RTC_CREATE_OFFER:
      createOffer().catch((e) => {
        console.error('[TwoSeat] createOffer failed:', e);
        chrome.runtime.sendMessage({
          type: TWOSEAT.MSG.RTC_STATE_CHANGE,
          state: 'failed',
          error: e.message,
        }).catch(() => {});
      });
      break;
    case TWOSEAT.MSG.RTC_ACCEPT_OFFER:
      acceptOffer(message.sdp).catch((e) => {
        console.error('[TwoSeat] acceptOffer failed:', e);
        chrome.runtime.sendMessage({
          type: TWOSEAT.MSG.RTC_STATE_CHANGE,
          state: 'failed',
          error: e.message,
        }).catch(() => {});
      });
      break;
    case TWOSEAT.MSG.RTC_SET_ANSWER:
      setAnswer(message.sdp).catch((e) => {
        console.error('[TwoSeat] setAnswer failed:', e);
        chrome.runtime.sendMessage({
          type: TWOSEAT.MSG.RTC_STATE_CHANGE,
          state: 'failed',
          error: e.message,
        }).catch(() => {});
      });
      break;
    case TWOSEAT.MSG.RTC_DATA_OUT:
      sendToPeer(message.data);
      break;
    case TWOSEAT.MSG.DISCONNECT:
      cleanup();
      break;
  }
});
