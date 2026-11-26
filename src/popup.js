const api = globalThis.browser ?? globalThis.chrome;

const statusEl = document.getElementById('status');
const buttons = [...document.querySelectorAll('button')];
const radios = [...document.querySelectorAll('input[name="mode"]')];

function show(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

// The mode lives in storage.local so the keyboard shortcut uses it too.
// storage is missing when the files changed but the extension was not reloaded.
const storage = api.storage?.local;
if (storage) {
  storage.get('mode').then(({ mode = 'keep' }) => {
    for (const r of radios) r.checked = r.value === mode;
  });
  for (const r of radios) r.addEventListener('change', () => storage.set({ mode: r.value }));
} else {
  show('Extension updated on disk: reload it from the extensions page', true);
}

async function run(action) {
  buttons.forEach((b) => (b.disabled = true));
  show('Capturing...');
  try {
    const mode = radios.find((r) => r.checked)?.value ?? 'keep';
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (action === 'preview') {
      const res = await api.runtime.sendMessage({ type: 'preview', tabId: tab.id, mode });
      if (!res?.ok) throw new Error(res?.error ?? 'no response from background');
      window.close();
      return;
    }
    const save = action === 'save';
    const res = await api.runtime.sendMessage({ type: 'capture', tabId: tab.id, mode, save });
    if (!res?.ok) throw new Error(res?.error ?? 'no response from background');
    const size = `${res.width}x${res.height}`;
    if (res.saved) {
      show(`Saved (${size})`);
      return;
    }
    const blob = await (await fetch(res.dataUrl)).blob();
    if (save) {
      const url = URL.createObjectURL(blob);
      await api.downloads.download({ url, filename: res.filename });
      show(`Saved (${size})`);
    } else {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      show(`Copied to clipboard (${size})`);
    }
  } catch (err) {
    show(String(err?.message ?? err), true);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

for (const action of ['preview', 'copy', 'save']) {
  document.getElementById(action).addEventListener('click', () => run(action));
}
