// 点击图标 → 注入拦截器 + capture.js → 自动剪贴板捕获（不发送）
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // 0. 读取字体映射表并注入到页面
    let fontMap = {};
    try {
      const resp = await fetch(chrome.runtime.getURL('font-map.json'));
      fontMap = await resp.json();
    } catch {}
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (map) => { window.__FONT_MAP = map; },
      args: [fontMap],
      world: 'MAIN'
    });
    // 1. 注入拦截器（修改剪贴板 payload 的字体+扁平化）
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: installFontInterceptor,
      world: 'MAIN'
    });
    // 2. 注入 capture.js
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['capture.js'],
      world: 'MAIN'
    });
    // 3. 直接显示选择工具栏（不先捕获）
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const { showClipboardBar } = window.figma.__clipboardFlow('body');
        showClipboardBar();
      },
      world: 'MAIN'
    });
  } catch (e) {
    console.warn('[figma-capture] inject failed:', e.message);
  }
});

// 拦截剪贴板写入，修改 payload（字体修正 + DOM 扁平化，不改网页）
function installFontInterceptor() {
  const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
  const ICON_RE = /Material|Symbol|Icon|FontAwesome|fa-/i;
  const SERIF_FONTS = new Set([
    'Georgia', 'Times New Roman', 'Times', 'Palatino', 'Palatino Linotype',
    'Garamond', 'Bookman', 'Book Antiqua', 'Cambria', 'Didot',
  ]);
  const PASSTHROUGH_TAGS = new Set([
    'DIV', 'SPAN', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER', 'NAV',
  ]);

  // --- Helpers ---

  function collectText(node) {
    if (!node || typeof node !== 'object') return '';
    if (node.nodeType === 3) return node.text || '';
    if (node.nodeType === 1 && Array.isArray(node.childNodes)) {
      return node.childNodes.map(collectText).join('');
    }
    return '';
  }

  // --- Font fix ---
  // CJK + serif → Noto Serif SC, CJK + sans-serif → PingFang SC
  // Icon fonts (Material Symbols) → keep icon font, append CJK fallback

  function isSerif(ff) {
    const list = ff.split(',').map(f => f.trim().replace(/^["']|["']$/g, ''));
    return list.some(f => SERIF_FONTS.has(f) || f === 'serif');
  }

  function cjkFont(ff) {
    return isSerif(ff) ? 'Noto Serif SC' : 'PingFang SC';
  }

  const FONT_MAP = window.__FONT_MAP || {};

  function fixFont(node) {
    if (!node || typeof node !== 'object') return;
    if (node.nodeType === 3) return;

    if (node.nodeType === 1) {
      if (Array.isArray(node.childNodes)) {
        node.childNodes.forEach(fixFont);
      }

      const ff = node.styles?.fontFamily;

      // No fontFamily: assign default to avoid Figma Times fallback
      if (!ff) {
        if (!node.styles) node.styles = {};
        node.styles.fontFamily = 'Noto Sans SC';
        return;
      }

      // Already has CJK font
      if (/PingFang|Noto (Sans|Serif) SC/i.test(ff)) return;

      // Icon font: keep it, but append CJK fallback for adjacent text
      if (ICON_RE.test(ff)) {
        const text = collectText(node);
        if (text && CJK_RE.test(text)) {
          node.styles.fontFamily = ff + ', PingFang SC';
        }
        return;
      }

      const text = collectText(node);
      if (text && CJK_RE.test(text)) {
        if (!node.styles) node.styles = {};
        node.styles.fontFamily = cjkFont(ff);
      }

      // Apply font mapping last — remap to Figma-available font names
      const cur = node.styles?.fontFamily;
      if (cur) {
        const mapped = cur.split(',')
          .map(f => {
            const trimmed = f.trim().replace(/^["']|["']$/g, '');
            return FONT_MAP[trimmed] || f.trim();
          })
          .join(', ');
        if (mapped !== cur) {
          node.styles.fontFamily = mapped;
        }
      }
    }
  }

  // --- Phase 3: Flatten pass-through wrappers (bottom-up) ---

  const TRANSPARENT_RE = /transparent|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(\.0+)?\s*\)/i;
  const ZERO_BORDER_RE = /^0(px)?\b/;

  function isVisibleBg(v) {
    if (!v || v === '' || v === 'none' || v === '0') return false;
    if (TRANSPARENT_RE.test(v)) return false;
    return true;
  }

  function isVisibleBorder(v) {
    if (!v || v === '' || v === 'none' || v === '0' || v === '0px') return false;
    if (ZERO_BORDER_RE.test(v)) return false;       // "0px solid ..."
    if (TRANSPARENT_RE.test(v)) return false;         // "1px solid transparent"
    return true;
  }

  function hasDecoration(node) {
    const s = node.styles || {};
    // Background
    if (isVisibleBg(s.backgroundColor) || isVisibleBg(s.background) || isVisibleBg(s.backgroundImage)) return true;
    // Border — shorthand and longhand (computed styles use longhand)
    for (const key of ['border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft']) {
      if (isVisibleBorder(s[key])) return true;
    }
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = s[`border${side}Width`];
      if (w && w !== '0' && w !== '0px') {
        const c = s[`border${side}Color`];
        if (c && !TRANSPARENT_RE.test(c)) return true;
      }
    }
    // Shadow, outline
    for (const key of ['boxShadow', 'outline']) {
      const v = s[key];
      if (v && v !== '' && v !== 'none' && v !== '0') return true;
    }
    // Opacity
    if (s.opacity && s.opacity !== '1') return true;
    // Note: borderRadius alone is NOT decoration (invisible without bg/border)
    // Note: overflow is handled in canFlatten with size check
    return false;
  }

  const FLEX_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'order', 'alignSelf'];
  const SIZE_TOLERANCE = 4; // px

  function sizeMatch(parentRect, childRect) {
    if (!parentRect || !childRect) return true;
    const dw = Math.abs((parentRect.width || 0) - (childRect.width || 0));
    const dh = Math.abs((parentRect.height || 0) - (childRect.height || 0));
    return dw <= SIZE_TOLERANCE && dh <= SIZE_TOLERANCE;
  }

  function canFlatten(node) {
    if (!node || node.nodeType !== 1) return false;
    if (!PASSTHROUGH_TAGS.has((node.tag || '').toUpperCase())) return false;
    if (hasDecoration(node)) return false;
    const children = Array.isArray(node.childNodes) ? node.childNodes : [];
    if (children.length !== 1) return false;
    const child = children[0];
    // overflow:hidden/clip only blocks when sizes differ
    const s = node.styles || {};
    const hasClip = s.overflow === 'hidden' || s.overflow === 'clip'
      || s.overflowX === 'hidden' || s.overflowY === 'hidden';
    if (hasClip && !sizeMatch(node.rect, child.rect)) return false;
    // Text child → always flatten
    if (child.nodeType === 3) return true;
    // Element child → only if ~same size
    return sizeMatch(node.rect, child.rect);
  }

  function promoteChild(wrapper, child) {
    // Transfer flex/layout props from wrapper to child
    const ws = wrapper.styles || {};
    for (const key of FLEX_KEYS) {
      if (ws[key] != null && ws[key] !== '') {
        if (!child.styles) child.styles = {};
        child.styles[key] = ws[key];
      }
    }
    // Child keeps its own rect (absolute coords already correct)
    return child;
  }

  function phase3Flatten(node) {
    if (!node || typeof node !== 'object') return node;
    if (node.nodeType === 3) return node;

    if (node.nodeType === 1 && Array.isArray(node.childNodes)) {
      // Recurse children first (bottom-up)
      node.childNodes = node.childNodes.map(phase3Flatten);

      // Flatten: promote single child of non-decorative same-size wrappers
      const hasSiblings = node.childNodes.length > 1;
      const newChildren = [];
      let changed = false;
      for (const child of node.childNodes) {
        if (canFlatten(child)) {
          const promoted = child.childNodes[0];
          // Don't promote text nodes when wrapper has siblings
          // (Figma merges adjacent text nodes)
          if (promoted.nodeType === 3 && hasSiblings) {
            newChildren.push(child);
          } else {
            newChildren.push(promoteChild(child, promoted));
            changed = true;
          }
        } else {
          newChildren.push(child);
        }
      }
      if (changed) node.childNodes = newChildren;
    }
    return node;
  }

  // --- Phase: Strip whitespace-only text nodes & zero-size empty frames ---

  function cleanupNodes(node) {
    if (!node || typeof node !== 'object') return node;
    if (node.nodeType === 3) return node;

    if (node.nodeType === 1 && Array.isArray(node.childNodes)) {
      // Recurse first
      node.childNodes = node.childNodes.map(cleanupNodes).filter(Boolean);

      // Remove whitespace-only text nodes
      node.childNodes = node.childNodes.filter(child => {
        if (child.nodeType === 3) {
          const text = (child.text || '').trim();
          if (!text) return false; // pure whitespace → remove
        }
        return true;
      });

      // Remove empty element nodes (no children, small rect, no decoration, not self-rendering tag)
      const SELF_RENDERING = new Set(['IMG', 'SVG', 'VIDEO', 'CANVAS', 'INPUT', 'TEXTAREA', 'SELECT', 'IFRAME', 'HR']);
      node.childNodes = node.childNodes.filter(child => {
        if (child.nodeType === 1) {
          const r = child.rect;
          const tag = (child.tag || '').toUpperCase();
          const hasChildren = Array.isArray(child.childNodes) && child.childNodes.length > 0;
          if (!hasChildren && !SELF_RENDERING.has(tag) && !hasDecoration(child) && r && (r.width < 1 || r.height < 1)) return false;
        }
        return true;
      });

      // Bubble up: non-decorative, non-self-rendering container with zero children → remove
      if (node.childNodes.length === 0) {
        const tag = (node.tag || '').toUpperCase();
        if (!SELF_RENDERING.has(tag) && !hasDecoration(node)) {
          return null;
        }
      }
    }
    return node;
  }

  // --- Transform pipeline ---

  function transformPayload(root) {
    fixFont(root);
    // Multiple passes: cleanup may expose new flatten opportunities
    for (let i = 0; i < 3; i++) {
      cleanupNodes(root);
      phase3Flatten(root);
    }
    return root;
  }

  // Guard against double install
  if (window.__figmaCaptureInterceptor) return;
  window.__figmaCaptureInterceptor = true;

  // --- Clipboard interceptor ---

  function tryTransformJson(text) {
    try {
      const obj = JSON.parse(text);
      const root = obj.root || obj;
      if (root.nodeType === 1) {
        transformPayload(root);
        console.log('[figma-capture] clipboard payload transformed');
        return JSON.stringify(obj);
      }
    } catch {}
    return null;
  }

  const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = async function(text) {
    const transformed = tryTransformJson(text);
    return origWriteText(transformed || text);
  };

  const H2D_PREFIX = '<!--(figh2d)';
  const H2D_SUFFIX = '(/figh2d)-->';

  function fixHtmlFonts(html) {
    // Extract base64 JSON from data-h2d attribute
    const match = html.match(/data-h2d="([^"]*)"/);
    if (!match) return html;

    let encoded = match[1];
    // Strip comment markers
    if (encoded.startsWith(H2D_PREFIX)) encoded = encoded.slice(H2D_PREFIX.length);
    if (encoded.endsWith(H2D_SUFFIX)) encoded = encoded.slice(0, -H2D_SUFFIX.length);

    try {
      // Decode base64 → UTF-8
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      const json = new TextDecoder().decode(bytes);
      const payload = JSON.parse(json);
      const root = payload.root || payload;
      if (root.nodeType === 1) {
        transformPayload(root);
        console.log('[figma-capture] clipboard h2d payload transformed');
      }
      // Encode back: UTF-8 → base64 (chunked to avoid stack overflow)
      const outBytes = new TextEncoder().encode(JSON.stringify(payload));
      let binary = '';
      for (let i = 0; i < outBytes.length; i += 8192) {
        binary += String.fromCharCode(...outBytes.subarray(i, i + 8192));
      }
      const newB64 = btoa(binary);
      const newAttr = H2D_PREFIX + newB64 + H2D_SUFFIX;
      return html.replace(match[1], newAttr);
    } catch (e) {
      console.warn('[figma-capture] clipboard h2d decode failed:', e);
      return html;
    }
  }

  const origWrite = navigator.clipboard.write.bind(navigator.clipboard);
  navigator.clipboard.write = async function(items) {
    const newItems = await Promise.all([...items].map(async (item) => {
      const types = item.types || [];
      if (types.includes('text/html')) {
        try {
          const blob = await item.getType('text/html');
          const html = await blob.text();
          const fixedHtml = fixHtmlFonts(html);
          const data = {};
          for (const t of types) {
            data[t] = t === 'text/html'
              ? new Blob([fixedHtml], { type: 'text/html' })
              : await item.getType(t);
          }
          return new ClipboardItem(data);
        } catch (e) {
          console.warn('[figma-capture] clipboard html fix failed:', e);
        }
      }
      return item;
    }));
    return origWrite(newItems);
  };

  console.log('[figma-capture] interceptor v3 installed');
}

