# TwoSeat

A Chrome extension for syncing video playback between two people. Uses WebRTC DataChannels for direct peer-to-peer communication — no server required.

## How It Works

1. Both users install the extension and open a page with a video
2. User A creates a room and copies the connection code
3. User B joins with that code and sends back a response code
4. User A pastes the response — done. Videos stay in sync automatically

Play, pause, and seek events are shared in real-time with drift correction.

## Install

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer Mode**
4. Click **Load Unpacked** and select the `twoseat-extension/` folder

## Usage Notes

- Testing requires **two separate Chrome profiles** (the extension can only run one connection per profile)
- Connection codes are exchanged manually (copy-paste via any messaging app)
- Works on any site with a `<video>` element
