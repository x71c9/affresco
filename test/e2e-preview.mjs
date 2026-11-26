// End-to-end check of the preview flow on Chromium: loads the built extension
// (with <all_urls> added, since activeTab needs a real click), serves the
// fixture over HTTP, runs capturePreview from the service worker and checks
// the preview tab.
// Usage: node test/e2e-preview.mjs [out.png]   (run `npm run build` first)
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, connect, launch, makeVisible, sleep } from './cdp.mjs';

const root = new URL('..', import.meta.url).pathname;
const work = await mkdtemp(join(tmpdir(), 'affresco-e2e-'));
const out = process.argv[2] ?? join(work, 'preview.png');
const ext = join(work, 'ext');
await cp(join(root, 'dist/chromium'), ext, { recursive: true });
const manifest = JSON.parse(await readFile(join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
await writeFile(join(ext, 'manifest.json'), JSON.stringify(manifest));

const fixture = await readFile(join(root, 'test/fixture.html'));
const server = createServer((_req, res) => res.end(fixture)).listen(0);
const pageUrl = `http://127.0.0.1:${server.address().port}/`;

const browser = await launch(9335, [`--load-extension=${ext}`]);
const cleanup = () => { browser.close(); server.close(); };
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { cleanup(); process.exit(1); });

try {
  // Some browser builds load other extensions too: pick ours by name.
  let w;
  for (let i = 0; i < 50 && !w; i++) {
    await sleep(200);
    for (const t of (await browser.list()).filter((t) => t.type === 'service_worker')) {
      const c = await connect(t.webSocketDebuggerUrl);
      if ((await c.evaluate('chrome.runtime.getManifest().short_name')) === 'Affresco') { w = c; break; }
      c.close();
    }
  }
  check(w, 'extension service worker is running');

  const page = (await browser.list()).find((t) => t.type === 'page');
  const p = await connect(page.webSocketDebuggerUrl);
  await makeVisible(p);
  await p.send('Page.navigate', { url: pageUrl });
  await sleep(1500);

  // The extension attaching the debugger sends the headless tab back to the
  // background, where rendering stops and captureScreenshot hangs: keep it in
  // front while the capture runs (a real browser captures the visible tab).
  const keepFront = setInterval(() => makeVisible(p).catch(() => {}), 300);
  const res = await w.evaluate(`(async () => {
    const [tab] = await chrome.tabs.query({ url: ${JSON.stringify(pageUrl + '*')} });
    return capturePreview(tab.id, 'keep');
  })()`);
  clearInterval(keepFront);
  check(res?.id, 'capture is stored');

  let preview;
  for (let i = 0; i < 30 && !preview; i++) {
    await sleep(200);
    preview = (await browser.list()).find((t) => t.type === 'page' && t.url.includes('/preview.html'));
  }
  check(preview, 'preview tab is opened');
  const v = await connect(preview.webSocketDebuggerUrl);
  await makeVisible(v);
  await sleep(800);
  const state = await v.evaluate(`({
    meta: document.getElementById('meta').textContent,
    status: document.getElementById('status').textContent,
    natural: [img.naturalWidth, img.naturalHeight],
    shown: [img.clientWidth, img.clientHeight],
    viewport: [innerWidth, innerHeight],
  })`);
  check(state.natural[0] > 1000 && state.natural[1] > 3000, `preview shows the capture (${state.natural.join('x')})`);
  check(state.shown[1] <= state.viewport[1], 'fit mode shows the whole image in the window');
  check(state.status === '', 'preview reports no error');
  const { data } = await v.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(out, Buffer.from(data, 'base64'));
  console.log(`wrote ${out}`);
} finally {
  cleanup();
}
