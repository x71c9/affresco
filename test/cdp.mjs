// Minimal Chrome DevTools Protocol client for the tests: launches headless
// Chromium (CHROMIUM selects the binary, default `chromium`) and connects to
// its targets.
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch(port, extraArgs = []) {
  const profile = await mkdtemp(join(tmpdir(), 'affresco-test-'));
  const chrome = spawn(process.env.CHROMIUM || 'chromium', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=1280,800', '--no-first-run', '--no-default-browser-check',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling', ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' });
  const list = () => fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
  for (let i = 0; i < 100 && !(await list()); i++) await sleep(100);
  return { chrome, list: async () => (await list()) ?? [], close: () => chrome.kill() };
}

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  };
  return { ws, send, evaluate, close: () => ws.close() };
}

// Headless tabs start hidden: rAF and IntersectionObserver would never run.
export async function makeVisible(target) {
  await target.send('Page.enable');
  await target.send('Page.bringToFront');
  await target.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await target.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
}

export function check(condition, message) {
  if (!condition) throw new Error(`check failed: ${message}`);
  console.log(`ok - ${message}`);
}
