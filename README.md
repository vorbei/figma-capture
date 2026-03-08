# Figma Capture

Chrome extension that captures any webpage into Figma's clipboard format via [HTML to Design](https://www.figma.com/community/plugin/1159123024924461424). Click the icon, then paste into Figma.

This extension adds a **post-processing layer** on top of Figma's official `capture.js` — it intercepts the clipboard payload and applies font fixes and DOM cleanup before it reaches Figma.

## What it does

- **CJK font fix** — Detects Chinese/Japanese/Korean text and remaps fonts to `PingFang SC` / `Noto Serif SC` so glyphs render correctly in Figma
- **Font mapping** — Remaps unavailable fonts to Figma-compatible equivalents via a user-configurable `font-map.json` (see `font-map.example.json`)
- **Default font fallback** — Assigns `Noto Sans SC` to elements without explicit `fontFamily`, preventing Figma's Times fallback
- **DOM flattening** — Removes pass-through wrapper `<div>`/`<span>` elements that add noise without visual contribution
- **Empty frame cleanup** — Strips zero-size childless elements and bubbles up removal of non-decorative empty containers
- **Event isolation** — Prevents toolbar clicks from triggering host page behaviors (menu close, focus change) by intercepting events at the window capture phase and re-dispatching them inside the toolbar's shadow DOM

## Setup

1. Download `capture.js` from Figma:
   ```
   make
   ```
2. Copy the font mapping example and customize as needed:
   ```
   cp font-map.example.json font-map.json
   ```
3. Go to `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select this directory

## Usage

1. Navigate to the page you want to capture
2. Click the extension icon (or press **Alt+Shift+F**)
3. Use the toolbar to capture the entire page or select a specific element
4. Switch to Figma and **Ctrl/Cmd+V** to paste

## How it works

1. `background.js` patches `Element.prototype.attachShadow` to save closed shadow root references (needed for event isolation)
2. `capture.js` (Figma's official script) serializes the DOM into a JSON payload and writes it to the clipboard
3. A clipboard interceptor (`navigator.clipboard.write` / `writeText`) transforms the payload before it's written:
   - Font correction (CJK, icon fonts, font mapping)
   - Whitespace/empty node cleanup
   - Wrapper flattening (promotes single children of non-decorative same-size containers)
4. An event shield intercepts clicks on the toolbar at the `window` capture phase, preventing host page side-effects (e.g. menus closing), then re-dispatches them inside the toolbar's closed shadow DOM via `shadowRoot.elementFromPoint`

## Disclaimer

This is an **unofficial community tool** for personal and educational use. It is not affiliated with, endorsed by, or supported by Figma, Inc.

- `capture.js` is downloaded at build time from Figma's public endpoint and is **not included** in this repository. It is subject to [Figma's Terms of Service](https://www.figma.com/tos/). Figma may change or remove this endpoint at any time, which could break the build or alter capture behavior.
- This extension only performs **local, client-side transformations** on clipboard data. It does not collect, transmit, or store any user data.
- The font names referenced (PingFang SC, Noto Sans SC, Google Sans Flex, etc.) are trademarks of their respective owners.
- This tool depends on Figma's HTML-to-Design clipboard format, which is undocumented and may change without notice. **No guarantee of continued functionality.**
- Use at your own risk. The authors are not responsible for any issues arising from the use of this tool.

## License

MIT
