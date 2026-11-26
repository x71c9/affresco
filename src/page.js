// Functions injected into the captured tab with scripting.executeScript.
// Each one must stay self-contained: it is serialized and run in the page.

async function affrescoPrepare(mode) {
  if (window.__affresco) {
    return { error: 'a capture is already in progress on this page' };
  }
  const state = { styles: new Map(), scrolls: [], spacer: null };
  window.__affresco = state;

  const set = (el, prop, value) => {
    if (!state.styles.has(el)) state.styles.set(el, el.getAttribute('style'));
    el.style.setProperty(prop, value, 'important');
  };
  // Waits for layout to settle; the timeout covers tabs where rAF is paused.
  const frame = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
      setTimeout(resolve, 100);
    });

  const root = document.scrollingElement || document.documentElement;
  const body = document.body || document.documentElement;
  // No page scrollbar: the width measured here stays the width of the capture
  // (the scrollbar would disappear only while capturing, cutting the right edge).
  set(document.documentElement, 'scrollbar-width', 'none');
  await frame();
  const vh = window.innerHeight;
  const elements = [document.documentElement, ...document.documentElement.querySelectorAll('*')];

  // 1. Scroll the window and every scroll container back to the top.
  state.scrolls.push([root, root.scrollLeft, root.scrollTop]);
  window.scrollTo(0, 0);
  const scrollers = [];
  for (const el of elements) {
    if (el === root || el.scrollHeight <= el.clientHeight + 1) continue;
    const s = getComputedStyle(el);
    if (!/(auto|scroll)/.test(s.overflowY)) continue;
    // Small widgets (dropdowns, code boxes) keep their own scrolling.
    if (el.clientHeight < vh * 0.4) continue;
    scrollers.push(el);
    state.scrolls.push([el, el.scrollLeft, el.scrollTop]);
    el.scrollTop = 0;
  }
  await frame();

  // 2. Record fixed elements (outermost only) while the page is at the top.
  const fixed = [];
  const sticky = [];
  for (const el of elements) {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    if (s.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (s.position === 'sticky') {
      sticky.push(el);
      continue;
    }
    if (fixed.some((f) => f.el.contains(el))) continue;
    fixed.push({ el, r });
  }

  // Side columns sized to the viewport (menus in flex/grid shells): they end
  // at the bottom of the screen and later stretch to the end of the page.
  const vw = window.innerWidth;
  const columns = [];
  for (const el of elements) {
    if (el === document.documentElement || el === document.body) continue;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.bottom - vh) > 2 || r.top > vh * 0.3 || r.height < vh * 0.6) continue;
    if (r.width > vw * 0.5 || r.width === 0) continue;
    if (scrollers.some((s) => s.contains(el) || el.contains(s))) continue;
    if (fixed.some((f) => f.el.contains(el))) continue;
    if (columns.some((c) => c.el.contains(el))) continue;
    columns.push({ el, r });
  }

  // Focused controls often show a tooltip (e.g. a menu dock button).
  if (document.activeElement && document.activeElement !== body) document.activeElement.blur();

  // 3. Let scroll containers and their ancestors grow to their full content.
  const unlock = (el) => {
    set(el, 'overflow', 'visible');
    set(el, 'height', 'auto');
    set(el, 'max-height', 'none');
  };
  unlock(document.documentElement);
  if (document.body) unlock(document.body);
  for (const el of scrollers) {
    unlock(el);
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) unlock(p);
  }

  // 4. Sticky elements sit at their natural place when the page is at the top.
  for (const el of sticky) set(el, 'position', 'static');
  // Hover tooltips left over from the mouse position.
  for (const el of document.querySelectorAll('[role="tooltip"]')) set(el, 'display', 'none');

  // 5. Scroll through the page so lazy content (IntersectionObserver,
  //    loading="lazy") is requested, then wait for the network to go quiet.
  await frame();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let requests = 0;
  const observer = new PerformanceObserver((list) => (requests += list.getEntries().length));
  try {
    observer.observe({ type: 'resource', buffered: false });
  } catch {}
  const pageBottom = () => Math.max(root.scrollHeight, body.scrollHeight);
  if (pageBottom() > vh * 1.2) {
    const step = Math.max(200, Math.floor(vh * 0.8));
    // IntersectionObserver runs in the rendering steps: wait for a full frame
    // at every position (a browser that renders slowly needs more than 120 ms).
    const rendered = () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
        setTimeout(resolve, 1000);
      });
    for (let y = step, i = 0; y < pageBottom() && i < 60; y += step, i++) {
      window.scrollTo(0, y);
      await Promise.all([sleep(120), rendered()]);
    }
    window.scrollTo(0, 0);
  }
  const t0 = performance.now();
  let seen = requests;
  let quietSince = t0;
  await sleep(600);
  while (performance.now() - t0 < 6000) {
    if (requests !== seen) {
      seen = requests;
      quietSince = performance.now();
    } else if (performance.now() - quietSince >= 700) break;
    await sleep(100);
  }
  observer.disconnect();
  await frame();

  // 6. Height of the real content: the lowest thing that paints (text,
  //    media, controls, boxes with background or border). Empty boxes and
  //    wrappers as tall as the page make the blank space at the end.
  const docHeight = pageBottom();
  const media = /^(img|svg|canvas|video|iframe|input|textarea|select|button|object|embed|hr)$/;
  const transparent = /^(transparent|rgba\(0, 0, 0, 0\))$/;
  const inFixed = (node) => fixed.some((f) => f.el.contains(node));
  let contentBottom = 0;
  for (const el of body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.height >= docHeight * 0.9) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.opacity === '0') continue;
    const paints =
      media.test(el.localName) ||
      s.backgroundImage !== 'none' ||
      !transparent.test(s.backgroundColor) ||
      (parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none');
    if (paints && r.bottom > contentBottom && !inFixed(el)) contentBottom = r.bottom;
  }
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.height === 0 || r.bottom <= contentBottom || inFixed(n)) continue;
    const s = getComputedStyle(n.parentElement);
    if (s.visibility !== 'hidden' && s.opacity !== '0') contentBottom = r.bottom;
  }
  contentBottom += window.scrollY;
  const contentHeight = contentBottom > 0
    ? Math.min(docHeight, Math.ceil(contentBottom) + 24)
    : docHeight;

  // 7. Fixed elements: hide them, or pin them as absolute boxes on the page.
  let pageHeight = contentHeight;
  if (mode === 'hide') {
    for (const { el } of fixed) set(el, 'display', 'none');
  } else {
    let bottomRoom = 0;
    for (const f of fixed) {
      // Tall boxes anchored at the top (sidebars) stretch to the end of the page.
      f.fullHeight = f.r.top <= 1 && f.r.height >= vh * 0.6;
      f.bottom = !f.fullHeight && f.r.bottom >= vh - 2 && f.r.top > vh * 0.5;
      if (f.bottom) bottomRoom = Math.max(bottomRoom, vh - f.r.top);
      set(f.el, 'position', 'absolute');
      set(f.el, 'top', '0px');
      set(f.el, 'left', '0px');
      set(f.el, 'right', 'auto');
      set(f.el, 'bottom', 'auto');
      set(f.el, 'box-sizing', 'border-box');
      set(f.el, 'width', `${f.r.width}px`);
      set(f.el, 'height', `${f.r.height}px`);
    }
    pageHeight = contentHeight + Math.ceil(bottomRoom);
    if (pageHeight > docHeight) {
      // Room at the end of the page for bars anchored to the bottom.
      state.spacer = document.createElement('div');
      state.spacer.style.cssText = `display:block!important;height:${pageHeight - docHeight}px!important`;
      body.appendChild(state.spacer);
    }
    await frame();
    for (const f of fixed) {
      const now = f.el.getBoundingClientRect();
      const targetTop = f.bottom ? pageHeight - (vh - f.r.top) : f.r.top;
      set(f.el, 'top', `${targetTop - now.top}px`);
      set(f.el, 'left', `${f.r.left - now.left}px`);
      if (f.fullHeight) set(f.el, 'height', `${pageHeight - f.r.top - (vh - f.r.bottom)}px`);
    }
  }

  for (const c of columns) {
    const h = `${pageHeight - c.r.top}px`;
    set(c.el, 'height', h);
    set(c.el, 'min-height', h);
    set(c.el, 'max-height', 'none');
  }

  window.scrollTo(0, 0);
  await frame();
  return {
    width: root.clientWidth,
    height: pageHeight,
    dpr: window.devicePixelRatio || 1,
    viewportWidth: window.innerWidth,
    // Visible content area, without scrollbars.
    clientHeight: root.clientHeight,
    title: document.title,
    url: location.href,
  };
}

function affrescoRestore() {
  const state = window.__affresco;
  if (!state) return;
  for (const [el, style] of state.styles) {
    if (style === null) el.removeAttribute('style');
    else el.setAttribute('style', style);
  }
  if (state.spacer) state.spacer.remove();
  for (const [el, left, top] of state.scrolls) {
    if (el === (document.scrollingElement || document.documentElement)) window.scrollTo(left, top);
    else {
      el.scrollLeft = left;
      el.scrollTop = top;
    }
  }
  delete window.__affresco;
}

// Scrolling fallback step: scrolls to `to` and hides fixed/sticky elements
// that pages show only after scrolling (compact headers, back-to-top buttons),
// so they do not repeat in every stitched piece. Returns the real scroll top.
async function affrescoScrollTo(to) {
  window.scrollTo(0, to);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const state = window.__affresco;
  if (state && to > 0) {
    for (const el of document.body.querySelectorAll('*')) {
      const p = getComputedStyle(el).position;
      if (p !== 'fixed' && p !== 'sticky') continue;
      if (!state.styles.has(el)) state.styles.set(el, el.getAttribute('style'));
      el.style.setProperty('visibility', 'hidden', 'important');
    }
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
      setTimeout(resolve, 100);
    });
  }
  return window.scrollY;
}
