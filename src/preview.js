const api = globalThis.browser ?? globalThis.chrome;

const img = document.getElementById('shot');
const statusEl = document.getElementById('status');
const zoomBtn = document.getElementById('zoom');
const copyBtn = document.getElementById('copy');
const saveBtn = document.getElementById('save');
const main = document.querySelector('main');
const zoomLevel = document.getElementById('zoomlevel');

let shot = null;

function show(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

// Fit: the whole image inside the window (never enlarged). Actual size: CSS
// pixels of the captured page, whatever the device pixel ratio.
function layout() {
  if (!shot) return;
  const fit = img.classList.contains('fit');
  document.body.classList.toggle('landscape', shot.width > shot.height);
  const s = getComputedStyle(main);
  const availW = main.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  const availH = main.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
  const scale = fit ? Math.min(1, availW / shot.width, availH / shot.height) : 1;
  img.style.width = `${Math.round(shot.width * scale)}px`;
  img.style.height = `${Math.round(shot.height * scale)}px`;
  zoomLevel.textContent = `${Math.round(scale * 100)}%`;
  zoomBtn.textContent = fit ? 'Actual size' : 'Fit to window';
}

function setFit(fit) {
  img.classList.toggle('fit', fit);
  layout();
  if (!fit) main.scrollTo(0, 0);
}

async function copy() {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': shot.blob })]);
    show('Copied to clipboard');
  } catch (err) {
    show(String(err?.message ?? err), true);
  }
}

async function save() {
  const url = URL.createObjectURL(shot.blob);
  try {
    await api.downloads.download({ url, filename: shot.filename });
    show('Saved');
  } catch (err) {
    show(String(err?.message ?? err), true);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

async function load() {
  const id = new URLSearchParams(location.search).get('id');
  shot = id ? await affrescoStore.get(id) : null;
  if (!shot) {
    show('Capture not found (only the last 5 are kept)', true);
    for (const b of [zoomBtn, copyBtn, saveBtn]) b.disabled = true;
    return;
  }
  img.src = URL.createObjectURL(shot.blob);
  layout();
  let host = '';
  try {
    host = new URL(shot.url).host;
  } catch {}
  document.getElementById('name').textContent = shot.title || host || shot.filename;
  document.getElementById('meta').textContent =
    `${host} · ${shot.width} x ${shot.height} px · ${new Date(shot.created).toLocaleString()}`;
  document.title = `Preview - ${shot.title || host}`;
}

window.addEventListener('resize', layout);
zoomBtn.addEventListener('click', () => setFit(!img.classList.contains('fit')));
img.addEventListener('click', () => setFit(!img.classList.contains('fit')));
copyBtn.addEventListener('click', copy);
saveBtn.addEventListener('click', save);
document.addEventListener('keydown', (e) => {
  if (!shot || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  const key = e.key.toLowerCase();
  if (key === 'c' && !String(getSelection())) {
    e.preventDefault();
    copy();
  } else if (key === 's') {
    e.preventDefault();
    save();
  }
});

load().catch((err) => show(String(err?.message ?? err), true));
