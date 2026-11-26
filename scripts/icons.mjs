// Generates the Affresco logo and extension icons from the shared geometry:
//   .github/logo-light.svg, .github/logo-dark.svg  (README)
//   icons/icon.svg, icons/icon-small.svg (32 px), icons/icon-16.svg (pixel grid)
//   icons/icon-{16,32,48,128}.png                   (rendered with headless Chromium)
// Usage: node scripts/icons.mjs
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brackets, gothicA } from './geometry.mjs';

const root = new URL('..', import.meta.url).pathname;

// A4: gothic "A" inside screenshot crop marks.
const glyph = `${brackets(10, 10, 118, 118, 26, 8)} ${gothicA(38, 90, 64, 38, 102, 9, 70, 8)}`;
// 16 px: drawn on the pixel grid (1 px crop marks, 2 px legs, stepped point),
// with a 1 px margin for the halo.
const r = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;
const pixelRows = [
  // [y, [x, width], ...] for the A, columns 4..11
  [3, [7, 2]], [4, [6, 4]], [5, [5, 2], [9, 2]], [6, [4, 2], [10, 2]], [7, [4, 2], [10, 2]],
  [8, [4, 8]], [9, [4, 8]], [10, [4, 2], [10, 2]], [11, [4, 2], [10, 2]], [12, [4, 2], [10, 2]],
];
const glyph16 = [
  r(1, 1, 4, 1), r(1, 1, 1, 4), r(11, 1, 4, 1), r(14, 1, 1, 4),
  r(1, 14, 4, 1), r(1, 11, 1, 4), r(11, 14, 4, 1), r(14, 11, 1, 4),
  ...pixelRows.flatMap(([y, ...spans]) => spans.map(([x, w]) => r(x, y, w, 1))),
].join(' ');
const icon16 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <defs>
    <filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="dilated"/>
      <feFlood flood-color="#ffffff" flood-opacity="0.35"/>
      <feComposite in2="dilated" operator="in" result="glow"/>
      <feMerge>
        <feMergeNode in="glow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <path filter="url(#glow)" fill="#000000" d="${glyph16}"/>
</svg>
`;
// Same design with heavier strokes, for 32 px.
const glyphSmall = `${brackets(6, 6, 122, 122, 34, 13)} ${gothicA(34, 94, 66, 42, 106, 14, 72, 12)}`;

const logo = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1280" viewBox="0 0 128 128">
  <path fill="${fill}" fill-rule="evenodd" d="${glyph}"/>
</svg>
`;

// Black glyph with a white halo, readable on light and dark toolbars.
const icon = (d) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 136 136">
  <defs>
    <filter id="glow" filterUnits="userSpaceOnUse" x="-4" y="-4" width="136" height="136">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="dilated"/>
      <feGaussianBlur in="dilated" stdDeviation="1.6" result="blurred"/>
      <feFlood flood-color="#ffffff" flood-opacity="0.85"/>
      <feComposite in2="blurred" operator="in" result="glow"/>
      <feMerge>
        <feMergeNode in="glow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <path filter="url(#glow)" fill="#000000" fill-rule="evenodd" d="${d}"/>
</svg>
`;

await mkdir(join(root, '.github'), { recursive: true });
await mkdir(join(root, 'icons'), { recursive: true });
await writeFile(join(root, '.github/logo-light.svg'), logo('#000000'));
await writeFile(join(root, '.github/logo-dark.svg'), logo('#ffffff'));
const iconSvg = icon(glyph);
const iconSmallSvg = icon(glyphSmall);
await writeFile(join(root, 'icons/icon.svg'), iconSvg);
await writeFile(join(root, 'icons/icon-small.svg'), iconSmallSvg);
await writeFile(join(root, 'icons/icon-16.svg'), icon16);

// PNG rendering over CDP, on a transparent background.
const port = 9336;
const profile = await mkdtemp(join(tmpdir(), 'affresco-icons-'));
const chrome = spawn('chromium', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
try {
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const list = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => []);
    page = list.find((t) => t.type === 'page');
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Page.enable');
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const size of [16, 32, 48, 128]) {
    const svg = size === 16 ? icon16 : size === 32 ? iconSmallSvg : iconSvg;
    await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    const html = `<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" style="display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`;
    await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
    await new Promise((r) => setTimeout(r, 300));
    const { data } = await send('Page.captureScreenshot', {
      format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
    });
    await writeFile(join(root, `icons/icon-${size}.png`), Buffer.from(data, 'base64'));
    console.log(`icons/icon-${size}.png`);
  }
  ws.close();
} finally {
  chrome.kill();
}
