# Figma Capture

Chrome extension to capture any webpage into a Figma file, bypassing CSP restrictions.

## Setup

1. Build (downloads `capture.js` from Figma):
   ```
   make
   ```
2. Go to `chrome://extensions`, enable Developer mode
3. Click "Load unpacked" and select this directory

## Usage

1. Navigate to the page you want to capture
2. Click the extension icon
3. Paste a Figma file URL (e.g. `https://www.figma.com/design/FILE_KEY/...`)
4. Click "Capture to Figma"

The URL is remembered for next time. The captured content appears in the target Figma file.

## How it works

- `chrome.scripting.executeScript` with `files` + `world: 'MAIN'` injects `capture.js` directly into the page context, bypassing Content Security Policy
- Background service worker fetches `captureId` from Figma's API (also CSP-exempt)
- `capture.js` serializes the DOM (computed styles, images, fonts) and POSTs to Figma
