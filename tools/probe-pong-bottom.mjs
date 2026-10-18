// One-off probe: measure the pong composition in the pinned/bottom "invite" state (matches verify viewport).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'http://localhost:3300').replace(/\/+$/, '');
const TAG = (BASE.match(/:(\d+)/) || ['', 'x'])[1];
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9417 + Math.floor(Math.random() * 200);
const userDataDir = path.join(os.tmpdir(), 'edge-cdp-pong-' + Date.now());
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, 'verify-shots');
fs.mkdirSync(SHOTS, { recursive: true });

let msgId = 0;
const pending = new Map();
function send(ws, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 60000);
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
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(400);
  }
  throw new Error('Edge CDP not reachable');
}

const MEASURE_EXPR = [
  'JSON.stringify((() => {',
  '  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), ow: el.offsetWidth, oh: el.offsetHeight }; };',
  '  const btn = document.querySelector("button.pong-ball");',
  '  if (!btn) return { err: "no button" };',
  '  const row = btn.parentElement;',
  '  const out = { scrollY: Math.round(window.scrollY), scrollH: document.documentElement.scrollHeight, row: r(row), btn: r(btn), btnTransform: getComputedStyle(btn).transform, btnBg: getComputedStyle(btn).backgroundColor, btnCls: (btn.getAttribute("class") || "").slice(0, 200) };',
  '  out.stems = [...row.children].filter((c) => c !== btn).map((c) => ({ rect: r(c), cls: (c.getAttribute("class") || "").slice(0, 90), transform: getComputedStyle(c).transform }));',
  '  out.inside = [...btn.querySelectorAll("*")].slice(0, 12).map((el) => ({ tag: el.tagName, rect: r(el), cls: (el.getAttribute("class") || "").slice(0, 110), opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform, bg: getComputedStyle(el).backgroundColor }));',
  '  return out;',
  '})())',
].join('\n');

async function main() {
  const edge = spawn(EDGE, [
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDataDir,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--window-size=1600,1000', 'about:blank',
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
    const evalJs = async (expression, awaitPromise = false) => {
      const r = await S('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
      if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
      return r.result.value;
    };
    const shot = async (name) => {
      const { data } = await S('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
      console.log('  shot', name);
    };
    await S('Page.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    try {
      await S('Page.navigate', { url: BASE + '/' });
    } catch (e) {
      console.log('navigate warning (continuing):', e.message);
    }
    for (let i = 0; i < 40; i++) {
      const rs = await evalJs('document.readyState + "|" + location.href');
      if (typeof rs === 'string' && rs.startsWith('complete|http')) { console.log('load:', rs); break; }
      await sleep(1000);
    }
    await sleep(9000);

    // scroll to the pong section and settle (pinned start)
    const pongSecTop = await evalJs('(() => { const b = document.querySelector("button.pong-ball"); return b ? Math.round(b.closest("section").getBoundingClientRect().top + window.scrollY) : -1; })()');
    console.log('pongSecTop:', pongSecTop);

    await evalJs(`new Promise(r => { window.scrollTo({top: ${pongSecTop}, behavior: "instant"}); setTimeout(r, 2500); })`, true);
    let m = JSON.parse(await evalJs(MEASURE_EXPR));
    console.log('\n=== PINNED START (scrollY ' + m.scrollY + ') ===');
    console.log(JSON.stringify({ row: m.row, btn: m.btn, transform: m.btnTransform, bg: m.btnBg }, null, 1));
    console.log('stems:', JSON.stringify(m.stems));
    console.log('inside:', JSON.stringify(m.inside));
    await shot('_pong-start-' + TAG + '.png');

    // scroll to the very bottom and settle like verify does
    await evalJs('new Promise(r => { window.scrollTo({top: 999999, behavior: "instant"}); setTimeout(r, 2400); })', true);
    await sleep(1200);
    m = JSON.parse(await evalJs(MEASURE_EXPR));
    console.log('\n=== BOTTOM (scrollY ' + m.scrollY + ' of ' + m.scrollH + ') ===');
    console.log(JSON.stringify({ row: m.row, btn: m.btn, transform: m.btnTransform, bg: m.btnBg }, null, 1));
    console.log('stems:', JSON.stringify(m.stems));
    console.log('inside:', JSON.stringify(m.inside));
    await shot('_pong-bottom-' + TAG + '.png');
  } finally {
    try { edge.kill(); } catch (e) {}
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
