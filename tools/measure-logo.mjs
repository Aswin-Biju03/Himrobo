// One-off: measure the monogram svg boxes (now logo slots) at a given viewport.
// usage: node tools/measure-logo.mjs <url> [width] [height]
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [url = 'http://localhost:3300/', w = '1920', h = '1000'] = process.argv.slice(2);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9411;
const userDataDir = path.join(os.tmpdir(), 'edge-cdp-mlogo-' + Date.now());

let msgId = 0;
const pending = new Map();
function send(ws, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(400);
  }
  throw new Error('Edge CDP not reachable');
}

const EXPR = [
  'JSON.stringify((() => {',
  '  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };',
  '  const logos = [...document.querySelectorAll(\'svg[viewBox="0 0 80 64"]\')].map((el) => {',
  '    const cs = getComputedStyle(el);',
  '    return { rect: r(el), cssW: cs.width, cssH: cs.height, ar: cs.aspectRatio, bgSize: cs.backgroundSize, bg: cs.backgroundImage.slice(0, 70), display: cs.display };',
  '  });',
  '  const pills = [...document.querySelectorAll("header a, header button")].map((el) => ({ t: (el.textContent || "").trim().slice(0, 12), rect: r(el) }));',
  '  return { vw: innerWidth, logos, header: r(document.querySelector("header")), pills };',
  '})())',
].join('\n');

async function main() {
  const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--window-size=${w},${h}`, 'about:blank',
  ], { stdio: 'ignore' });
  try {
    const ws = new WebSocket(await getWsUrl());
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
    const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(ws, m, p, sessionId);
    await S('Page.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false });
    await S('Page.navigate', { url });
    await sleep(9000);
    const out = await S('Runtime.evaluate', { expression: EXPR, returnByValue: true });
    console.log(out.result.value);
  } finally {
    try { edge.kill(); } catch (e) {}
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
