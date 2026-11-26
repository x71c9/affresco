// Chromium loads this file as a service worker, Firefox as a background script
// (after page.js and store.js, listed in its manifest).
if (typeof importScripts === 'function' && typeof affrescoPrepare === 'undefined') {
  importScripts('page.js', 'store.js');
}

const api = globalThis.browser ?? globalThis.chrome;
// Capture method by available API, not by browser name: the debugger API
// (Chromium), tabs.captureTab (Firefox), or scrolling captureVisibleTab.
const hasDebugger = typeof api.debugger?.attach === 'function';
const hasCaptureTab = typeof api.tabs.captureTab === 'function';
// runtime.getBrowserInfo exists only in Firefox.
const isFirefox = typeof api.runtime.getBrowserInfo === 'function';

// Largest bitmap side and area kept below browser canvas/texture limits.
const MAX_SIDE = hasDebugger ? 16384 : 32000;
const MAX_AREA = 250_000_000;
const RECT_CHUNK = 4000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const errorText = (err) => String(err?.message ?? err);

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  let job;
  if (msg?.type === 'capture') job = captureDirect(msg.tabId, msg.mode, Boolean(msg.save));
  else if (msg?.type === 'preview') job = capturePreview(msg.tabId, msg.mode);
  else return false;
  job
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: errorText(err) }));
  return true;
});

api.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-preview') return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const { mode = 'keep' } = await api.storage.local.get('mode');
  try {
    await api.action.setBadgeText({ tabId: tab.id, text: '...' });
    await capturePreview(tab.id, mode);
    await api.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch (err) {
    await api.action.setBadgeText({ tabId: tab.id, text: 'ERR' });
    await api.action.setTitle({ tabId: tab.id, title: `affresco: ${errorText(err)}` });
  }
});

// Capture for the popup's Copy/Save buttons: the image goes back as a data URL.
async function captureDirect(tabId, mode, save) {
  const shot = await capture(tabId, mode);
  if (save && isFirefox) {
    // Firefox closes the popup when the download starts, revoking its blob
    // URLs: the download is started from here instead.
    const blob = await (await fetch(shot.dataUrl)).blob();
    const url = URL.createObjectURL(blob);
    await api.downloads.download({ url, filename: shot.filename });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { width: shot.width, height: shot.height, saved: true };
  }
  return shot;
}

// Capture stored in IndexedDB and shown in a preview tab next to the page.
async function capturePreview(tabId, mode) {
  const { dataUrl, ...meta } = await capture(tabId, mode);
  const blob = await (await fetch(dataUrl)).blob();
  const id = await affrescoStore.add({ ...meta, blob, created: Date.now() });
  const tab = await api.tabs.get(tabId);
  await api.tabs.create({
    url: api.runtime.getURL(`preview.html?id=${id}`),
    index: tab.index + 1,
    openerTabId: tabId,
  });
  return { id };
}

async function run(tabId, func, args = []) {
  const [res] = await api.scripting.executeScript({ target: { tabId }, func, args });
  return res?.result;
}

function outputScale(m) {
  const bySide = MAX_SIDE / Math.max(m.width, m.height);
  const byArea = Math.sqrt(MAX_AREA / (m.width * m.height));
  return Math.min(m.dpr, bySide, byArea);
}

async function capture(tabId, mode) {
  let attached = false;
  try {
    if (hasDebugger) {
      await api.debugger.attach({ tabId }, '1.3');
      attached = true;
      // The "debugging this browser" bar resizes the viewport: let it settle.
      await sleep(400);
    }
    const m = await run(tabId, affrescoPrepare, [mode]);
    if (!m) throw new Error('page did not respond');
    if (m.error) throw new Error(m.error);
    const scale = outputScale(m);
    let dataUrl;
    if (hasDebugger) dataUrl = await captureDebugger(tabId, m, scale);
    else if (hasCaptureTab) dataUrl = await captureRects(tabId, m, scale);
    else dataUrl = await captureScrolling(tabId, m, scale);
    return {
      dataUrl,
      filename: fileName(m.url),
      width: m.width,
      height: m.height,
      url: m.url,
      title: m.title,
    };
  } finally {
    await run(tabId, affrescoRestore).catch(() => {});
    if (attached) await api.debugger.detach({ tabId }).catch(() => {});
  }
}

// Chromium: one shot of the whole page through the DevTools protocol.
async function captureDebugger(tabId, m, scale) {
  // Device pixels = CSS pixels * dpr * clip.scale.
  const { data } = await api.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
    clip: { x: 0, y: 0, width: m.width, height: m.height, scale: scale / m.dpr },
  });
  return `data:image/png;base64,${data}`;
}

// Firefox: tabs.captureTab renders any rectangle of the page, in chunks.
async function captureRects(tabId, m, scale) {
  const { canvas, ctx } = makeCanvas(m, scale);
  for (let y = 0; y < m.height; y += RECT_CHUNK) {
    const h = Math.min(RECT_CHUNK, m.height - y);
    const url = await api.tabs.captureTab(tabId, {
      format: 'png',
      rect: { x: 0, y, width: m.width, height: h },
      scale,
    });
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    ctx.drawImage(bitmap, 0, Math.round(y * scale));
    bitmap.close();
  }
  return canvasToDataUrl(canvas);
}

// Fallback: scroll the prepared page one viewport at a time and stitch the
// visible captures. Fixed elements are already absolute boxes, so they
// appear once.
async function captureScrolling(tabId, m, scale) {
  const { windowId } = await api.tabs.get(tabId);
  const { canvas, ctx } = makeCanvas(m, scale);
  for (let y = 0; y < m.height; y += m.clientHeight) {
    const top = await run(tabId, affrescoScrollTo, [y]);
    // Chromium allows two captureVisibleTab calls per second.
    if (y > 0 && !isFirefox) await sleep(550);
    const url = await api.tabs.captureVisibleTab(windowId, { format: 'png' });
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    // Bitmap pixels per CSS pixel; the source rectangle leaves out scrollbars.
    const px = bitmap.width / m.viewportWidth;
    ctx.drawImage(
      bitmap,
      0, 0, Math.round(m.width * px), Math.round(m.clientHeight * px),
      0, Math.round(top * scale), Math.round(m.width * scale), Math.round(m.clientHeight * scale),
    );
    bitmap.close();
  }
  return canvasToDataUrl(canvas);
}

// OffscreenCanvas works in service workers and background pages alike.
function makeCanvas(m, scale) {
  const canvas = new OffscreenCanvas(Math.round(m.width * scale), Math.round(m.height * scale));
  return { canvas, ctx: canvas.getContext('2d') };
}

async function canvasToDataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function fileName(href) {
  let base = 'page';
  try {
    const u = new URL(href);
    base = `${u.hostname}${u.pathname}`;
  } catch {}
  base = base.replace(/[^a-z0-9.-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'page';
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  return `${base}_${stamp}.png`;
}
