// One-shot screenshot of any URL (file:// or http://) via headless Edge CDP.
// usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs] [scrollY]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const [url, out, w = '1200', h = '3000', wait = '900', scrollY = '0'] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs] [scrollY]');
  process.exit(1);
}
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9411;
const userDataDir = path.join(os.tmpdir(), 'edge-cdp-shot-' + Date.now());

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

async function main() {
  const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--hide-scrollbars', `--window-size=${w},${h}`,
    'about:blank',
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
    await sleep(Number(wait));
    if (Number(scrollY) > 0) {
      await S('Runtime.evaluate', { expression: `window.scrollTo({ top: ${Number(scrollY)}, behavior: 'instant' })` });
      await sleep(2400); // let scroll-driven animations settle
    }
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log('saved', out);
  } finally {
    try { edge.kill(); } catch (e) {}
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
