# <img src="twoseat-extension/icons/icon48.png" width="32" height="32" alt="TwoSeat logo"> TwoSeat

A Chrome extension for syncing video playback between two users. Uses WebRTC DataChannels for direct peer-to-peer communication.

## How It Works

1. Both users install the extension and open a page with a video
2. User A creates a room — the extension generates a WebRTC SDP offer, bundles ICE candidates, and base64-encodes it into a connection code
3. User B pastes that code — the extension sets it as the remote description, creates an SDP answer, and encodes it the same way
4. User A pastes the response code — the DataChannel opens and both sides begin exchanging events

The content script hooks into the largest `<video>` element on the page and listens for play, pause, and seek events. When a local event fires, it's sent over the DataChannel to the peer, which applies it to their video. A suppress counter prevents the applied event from echoing back.

Every second, each side sends a sync tick with its current playback time and a timestamp. The receiver computes drift (accounting for network latency via `sentAt`) and corrects: jumps for >1s drift, subtle playback rate adjustment (0.9x–1.1x) for 50ms–1s, and no action under 50ms.

## Technology

- Chrome Extension (Manifest V3), vanilla JS, zero dependencies, no build step
- WebRTC DataChannels for direct peer-to-peer communication — no server involved
- Connection codes are base64-encoded SDP offers/answers with bundled ICE candidates
- Three-tier drift correction: jump (>1s), playback rate adjust (50ms–1s), ignore (<50ms)
- Four coordinating contexts: popup, service worker, offscreen document (holds the RTCPeerConnection), and content script (intercepts video events)

## Install

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer Mode**
4. Click **Load Unpacked** and select the `twoseat-extension/` folder

## Usage Notes

- Testing requires **two separate Chrome profiles** (the extension can only run one connection per profile)
- Connection codes are exchanged manually (copy-paste via any messaging app)
- Works on any site with a `<video>` element
