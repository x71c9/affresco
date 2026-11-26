// Runs the page script (src/page.js) and the Chromium capture path on a page
// in headless Chromium, checks the capture and that the page is restored.
// Usage: node test/cdp-test.mjs [url] [keep|hide] [out.png]
//   default url: test/fixture.html; default out: a temporary file
//   WAIT=<ms> waits longer after loading the page (default 1500).
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, connect, launch, makeVisible, sleep } from './cdp.mjs';

const fixture = new URL('./fixture.html', import.meta.url).href;
const [url = fixture, mode = 'keep', out = join(tmpdir(), `affresco-${mode}.png`)] = process.argv.slice(2);
const pageJs = await readFile(new URL('../src/page.js', import.meta.url), 'utf8');

const browser = await launch(9333, ['--allow-file-access-from-files']);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { browser.close(); process.exit(1); });

try {
  const tab = await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
  const p = await connect(tab.webSocketDebuggerUrl);
  await p.send('Page.enable');
  await p.send('Page.navigate', { url });
  await makeVisible(p);
  await sleep(Number(process.env.WAIT ?? 1500));

  const scrollOf = `(document.getElementById('main')?.scrollTop ?? scrollY)`;
  const before = await p.evaluate(scrollOf);
  const m = await p.evaluate(`${pageJs}; affrescoPrepare(${JSON.stringify(mode)})`);
  console.log(`page ${m.width}x${m.height}, viewport ${m.viewportWidth}x${m.clientHeight}`);

  const scale = Math.min(m.dpr, 16384 / Math.max(m.width, m.height));
  // A tab that is not in front can hang on captureScreenshot in headless mode.
  await p.send('Page.bringToFront');
  const { data } = await p.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, fromSurface: true,
    clip: { x: 0, y: 0, width: m.width, height: m.height, scale: scale / m.dpr },
  });
  await writeFile(out, Buffer.from(data, 'base64'));
  await p.evaluate('affrescoRestore()');
  console.log(`wrote ${out}`);

  if (url === fixture) {
    const lazy = await p.evaluate(`document.getElementById('lazy').textContent`);
    check(m.height > m.clientHeight * 3, 'page height covers the inner scroll container');
    check(m.height < 4300, 'blank space after the content is trimmed');
    check(lazy === 'LAZY: loaded', 'lazy content is loaded before the capture');
  }
  check((await p.evaluate(scrollOf)) === before, 'scroll position is restored');
  check((await p.evaluate('!!window.__affresco')) === false, 'page state is cleared');
  p.close();
} finally {
  browser.close();
}
