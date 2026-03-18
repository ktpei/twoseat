# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

TwoSeat is a Chrome extension (Manifest V3) for P2P video synchronization between two users using WebRTC DataChannels. No server relays commands — users exchange connection codes manually (copy-paste), then all sync data flows directly peer-to-peer.

## Development

Load the extension in Chrome: `chrome://extensions` → Developer Mode → Load Unpacked → select `twoseat-extension/`.

After code changes, click the reload button on the extension card, then refresh any open video pages (content script re-injects on page load).

Testing requires **two separate Chrome profiles** — the extension uses a single offscreen document per profile, so both sides can't run in the same profile.

To inspect logs: `chrome://extensions` → TwoSeat → click "Service worker" link for service worker/offscreen logs. Content script logs appear in the YouTube page's DevTools console (filter by `[TwoSeat]`).

## Architecture

Four runtime contexts communicate via `chrome.runtime.sendMessage` (broadcast) and `chrome.tabs.sendMessage` (targeted to content script):

```
Popup ←→ Service Worker ←→ Offscreen Document
                ↕
         Content Script
```

- **`popup/`** — UI for manual SDP signaling (create/join room, copy-paste offer/answer codes). Polls `chrome.storage.session` every 500ms for async state updates. No persistent connection to the service worker.
- **`service-worker.js`** — Message router between all contexts. Manages offscreen lifecycle, stores connection state in `chrome.storage.session`, updates extension badge icon.
- **`offscreen.js`** — Holds the `RTCPeerConnection` and `RTCDataChannel`. Created with `WEB_RTC` reason (persists indefinitely). All WebRTC state lives here. SDP offers/answers are base64-encoded with ICE candidates bundled (waits for ICE gathering to complete before surfacing).
- **`content-script.js`** — Injected on all pages. Finds the largest `<video>` element, attaches play/pause/seek listeners, applies remote commands with drift correction, runs the 1-second sync ticker.
- **`lib/protocol.js`** — Shared constants (`TWOSEAT` object): message types, wire protocol actions, drift thresholds, STUN server config. Loaded by all contexts.

## Key Patterns

**Suppress broadcast counter** (`content-script.js`): When applying a remote command (e.g., `video.play()`), `suppressCount` is incremented to prevent the resulting DOM event from echoing back to the peer. Decremented after 100ms via `setTimeout`. Uses a counter (not boolean) to handle overlapping commands.

**Drift correction** (`content-script.js`): Three tiers — >1s drift jumps directly, 50ms–1s adjusts playback rate (0.9x–1.1x), <50ms does nothing. Latency is estimated from `Date.now() - control.sentAt`.

**Offscreen ready handshake** (`service-worker.js` / `offscreen.js`): The offscreen document sends `'twoseat:offscreen-ready'` on load. The service worker's `ensureOffscreen()` waits for this signal (with 1s timeout fallback) before sending RTC commands.

**"Connected" source of truth**: Only the DataChannel `onopen` event triggers the `'connected'` state — not ICE state changes (which can fire one-directionally before the channel is usable).

## Connection Flow

1. User A: Create Room → offscreen generates SDP offer (base64 with ICE bundled)
2. User A copies code, sends to User B out-of-band
3. User B: Join Room → pastes code → Generate Response → offscreen creates SDP answer
4. User B copies response, sends back to User A
5. User A: pastes response → Connect → offscreen sets remote description → DataChannel opens
6. Both content scripts start sync ticker, video events flow over DataChannel

## Git Workflow
commit after every fix with concise commit message, no claude authorship.