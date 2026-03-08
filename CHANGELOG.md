# Changelog

## 1.2 — 2026-03-08

### Added
- **Event isolation** — Toolbar clicks no longer trigger host page behaviors (menu close, dropdown dismiss, focus change). Achieved by intercepting events at the `window` capture phase and re-dispatching them inside the toolbar's closed shadow DOM via `shadowRoot.elementFromPoint`.
- **Keyboard shortcut** — `Alt+Shift+F` to activate capture (configurable in `chrome://extensions/shortcuts`).
- **`attachShadow` patch** — Saves closed shadow root references before `capture.js` loads, enabling the event shield to find real click targets inside the toolbar.

### Changed
- Extracted `captureTab()` function for reuse between icon click and keyboard shortcut.
- Cached toolbar host element lookup in event handlers to avoid per-event DOM queries.

## 1.1

### Added
- Font mapping via user-configurable `font-map.json`.
- Empty frame cleanup (zero-size childless elements, non-decorative empty containers).

## 1.0

### Added
- Initial release.
- CJK font fix (PingFang SC / Noto Serif SC).
- Default font fallback (Noto Sans SC).
- DOM flattening (pass-through wrapper removal).
- Clipboard interceptor for font correction and DOM cleanup.
