// Lenis smooth-scrolling smoke test (headless Edge via CDP).
// Usage: node tools/smoke-lenis.mjs [url]   (default http://localhost:3000)
//
// Runs at a short viewport (1280x620) from the start — resizing mid-run makes
// headless swiftshader drop the WebGL context, which then wedges CDP input.
//
// Verifies:
//   - the Lenis bootstrap ran (window.__lenis, html.lenis, 1.3.27)
//   - wheel scrolling glides smoothly (mid-flight sample, monotonic, reaches target)
//   - while the service dialog is open Lenis is stopped: the blurred page behind
//     does not scroll (wheels at two backdrop points are locked)
//   - the dialog body scrolls natively (data-lenis-prevent) while the page behind
//     stays locked
//   - closing the dialog releases the lock; wheel scrolling works again
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const SITE = process.argv[2] || 'http://localhost:3000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9429;
const VW = 1280;
const VH = 620;
const userDataDir = path.join(os.tmpdir(), 'edge-cdp-lenis-' + Date.now());
let proc, msgId = 0, pending = new Map(), sock, sessionId;
const events = [];
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label, pass, detail = '') => {
  results.push({ label, pass, detail });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + label + (detail ? '   [' + detail + ']' : ''));
};

function send(method, params = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const t = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout:' + method)); }, timeout);
    pending.set(id, { resolve, reject });
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    sock.send(JSON.stringify(payload));
  });
}
async function evalJs(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
  return r.result.value;
}
async function wheel(x, y, delta) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: delta, pointerType: 'mouse' }, 8000);
      return true;
    } catch (e) {
      await sleep(700);
    }
  }
  return false;
}
const STATE = `(() => {
  const d = document.querySelector('dialog[data-him-svc-dialog]');
  const body = d ? d.querySelector('div[style*="overflow-y"]') : null;
  return {
    y: Math.round(scrollY), open: !!d && d.open,
    bodyTop: body ? Math.round(body.scrollTop) : null,
    bodyRoom: body ? body.scrollHeight - body.clientHeight : null,
    stopped: document.documentElement.classList.contains('lenis-stopped'),
  };
})()`;

async function main() {
  proc = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--enable-unsafe-swiftshader', `--window-size=${VW},${VH}`, 'about:blank',
  ], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (res.ok) { wsUrl = (await res.json()).webSocketDebuggerUrl; break; } } catch (e) {}
    await sleep(400);
  }
  if (!wsUrl) { console.error('ERR no CDP'); proc.kill(); process.exit(1); }
  sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  sock.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params.args || []).map((a) => a.value || a.description || '').join(' ');
      if (text) events.push(text);
      return;
    }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
  sessionId = sid;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: SITE + '/' });
  await sleep(9000);

  // ---------------------------------------------------------------- boot
  const boot = await evalJs(`(() => ({
    lenis: !!window.__lenis,
    version: window.lenisVersion || '',
    cls: document.documentElement.classList.contains('lenis'),
    smoothCapable: typeof window.Lenis === 'function',
  }))()`);
  ok('lenis bootstrapped (window.__lenis + html.lenis + v1.3.27)',
    !!boot && boot.lenis === true && boot.cls === true && boot.smoothCapable === true && boot.version === '1.3.27',
    JSON.stringify(boot));

  // ------------------------------------------------- smooth wheel glide
  const y0 = await evalJs('Math.round(scrollY)');
  const dispatched = await wheel(VW / 2, 400, 700);
  const samples = [];
  for (let k = 1; k <= 16; k++) { await sleep(100); samples.push(await evalJs('Math.round(scrollY)')); }
  const final = samples[samples.length - 1];
  const mid = samples.find((v) => v > y0 + 30 && v < y0 + 700 - 60);
  const monotonic = samples.every((v, i) => i === 0 ? v >= y0 : v >= samples[i - 1] - 2);
  ok('wheel scroll glides smoothly (mid-flight sample + target reached)',
    dispatched && final >= y0 + 550 && mid !== undefined && monotonic,
    JSON.stringify({ y0, final, mid, samples: samples.slice(0, 6) }));

  // settle before programmatic scrolling
  await sleep(1600);

  // ------------------------------------------------- modal: lock + nested body scroll
  await evalJs(`(async () => {
    const card = document.querySelector('div[class*="justify-self-end bg-white"]');
    const sec = card.closest('section');
    const m = () => sec.getBoundingClientRect().top + scrollY;
    scrollTo({ top: m() + (sec.offsetHeight - innerHeight) * 0.375, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 400));
    scrollTo({ top: m() + (sec.offsetHeight - innerHeight) * 0.375, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 1200));
  })()`, true);
  await evalJs(`document.querySelector('button[data-him-detail]').click()`);
  await sleep(900);
  const sOpen = await evalJs(STATE);
  ok('service dialog open -> lenis stopped', sOpen.open === true && sOpen.stopped === true && sOpen.bodyRoom > 40,
    JSON.stringify({ open: sOpen.open, stopped: sOpen.stopped, bodyRoom: sOpen.bodyRoom }));

  const bodyDispatched = await wheel(VW / 2, 400, 400);
  await sleep(700);
  const sBody = await evalJs(STATE);
  ok('wheel over dialog body scrolls it natively, page stays locked',
    bodyDispatched && sBody.bodyTop >= 40 && sBody.y === sOpen.y,
    JSON.stringify({ bodyTop: sBody.bodyTop, y: sBody.y, prev: sOpen.y }));

  const bdRight = await wheel(VW - 80, 100, 400);
  await sleep(500);
  const sLock1 = await evalJs(STATE);
  const bdCorner = await wheel(8, 8, 400);
  await sleep(500);
  const sLock2 = await evalJs(STATE);
  ok('page behind modal is locked (backdrop wheels do nothing)',
    bdRight && bdCorner && sLock1.y === sOpen.y && sLock2.y === sOpen.y && sLock2.open === true,
    JSON.stringify({ yRight: sLock1.y, yCorner: sLock2.y, prev: sOpen.y }));

  // ------------------------------------------------- release on close
  await evalJs(`document.querySelector('button[data-him-svc-close]').click()`);
  await sleep(700);
  const sClosed = await evalJs(STATE);
  ok('dialog closed -> lenis running again', sClosed.open === false && sClosed.stopped === false, JSON.stringify(sClosed));

  const y2 = await evalJs('Math.round(scrollY)');
  const reDispatched = await wheel(VW / 2, 400, 400);
  await sleep(1400);
  const y3 = await evalJs('Math.round(scrollY)');
  ok('after closing, wheel scrolls the page again', reDispatched && y3 >= y2 + 200, JSON.stringify({ y2, y3 }));

  // ---------------------------------------------------------------- console
  // Headless swiftshader can drop the WebGL context after long runs (THREE logs
  // it); it is unrelated to Lenis and cannot wedge input as long as the emulated
  // viewport never changes mid-run.
  const fatal = events.filter((e) => !/THREE\.Clock/.test(e) && !/Context Lost/.test(e));
  ok('no console errors (Three.Clock + swiftshader context loss ignored)', fatal.length === 0, fatal.slice(0, 4).join(' || '));

  console.log('\n===== summary =====');
  const fails = results.filter((r) => !r.pass).length;
  console.log(`checks: ${results.length}, failures: ${fails}`);
  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL CHECKS PASSED');
  proc.kill();
  sock.close();
  process.exit(fails ? 2 : 0);
}
main().catch((e) => { console.error('ERR', e.message); if (proc) proc.kill(); process.exit(1); });
