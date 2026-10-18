// Measure + screenshot the two giant white mark compositions (hero + video) on the live page.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'http://localhost:3300').replace(/\/+$/, '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9417 + Math.floor(Math.random() * 200);
const userDataDir = path.join(os.tmpdir(), 'edge-cdp-marks-' + Date.now());
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

const INFO_EXPR = [
  'JSON.stringify((() => {',
  '  const comp = [...document.querySelectorAll(\'div[aria-hidden="true"]\')].find((d) => d.children.length === 3 && (d.children[0].getAttribute("class") || "").includes("z-behind-content"));',
  '  const btn = document.querySelector("button.pong-ball");',
  '  const docY = (el) => el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1;',
  '  return {',
  '    heroFound: !!comp,',
  '    heroCompY: docY(comp),',
  '    heroSecTop: comp ? Math.round(comp.closest("section").getBoundingClientRect().top + window.scrollY) : -1,',
  '    pongFound: !!btn,',
  '    pongRowY: docY(btn ? btn.parentElement : null),',
  '    pongSecTop: btn ? Math.round(btn.closest("section").getBoundingClientRect().top + window.scrollY) : -1,',
  '  };',
  '})())',
].join('\n');

const MEASURE_EXPR = [
  'JSON.stringify((() => {',
  '  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };',
  '  const cs = (el) => { const c = getComputedStyle(el); return { radius: c.borderTopLeftRadius, margin: c.marginLeft + " / " + c.marginRight, transform: c.transform }; };',
  '  const out = { scrollY: Math.round(window.scrollY) };',
  '  const comp = [...document.querySelectorAll(\'div[aria-hidden="true"]\')].find((d) => d.children.length === 3 && (d.children[0].getAttribute("class") || "").includes("z-behind-content"));',
  '  if (comp) { out.hero = { row: r(comp), kids: [...comp.children].map((k) => ({ rect: r(k), s: cs(k), cls: (k.getAttribute("class") || "").slice(0, 130) })) }; }',
  '  const btn = document.querySelector("button.pong-ball");',
  '  if (btn) { out.pong = { row: r(btn.parentElement), stem: r(btn.parentElement.children[0]), btn: { rect: r(btn), s: cs(btn), cls: (btn.getAttribute("class") || "").slice(0, 130) } }; }',
  '  return out;',
  '})())',
].join('\n');

async function main() {
  const edge = spawn(EDGE, [
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDataDir,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--window-size=1920,1000', 'about:blank',
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
    await S('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1000, deviceScaleFactor: 1, mobile: false });
    try {
      await S('Page.navigate', { url: BASE + '/' });
    } catch (e) {
      console.log('navigate warning (continuing):', e.message);
    }
    for (let i = 0; i < 40; i++) {
      const rs = await evalJs('document.readyState + "|" + location.href + "|" + document.documentElement.scrollHeight');
      if (typeof rs === 'string' && rs.startsWith('complete|http')) { console.log('load:', rs); break; }
      if (i === 39) console.log('load poll ended:', rs);
      await sleep(1000);
    }
    await sleep(9000);

    const info = JSON.parse(await evalJs(INFO_EXPR));
    console.log('info:', JSON.stringify(info));

    const measure = async () => JSON.parse(await evalJs(MEASURE_EXPR));
    const scrollTo = (y) => evalJs('new Promise(r => { window.scrollTo({top: ' + y + ', behavior: "instant"}); setTimeout(r, 1300); })', true);

    console.log('\n===== HERO composition (scroll sweep) =====');
    for (const y of [0, 400, 800, 1100, 1300]) {
      await scrollTo(y);
      const m = await measure();
      const h = m.hero;
      if (h) {
        const stemA = h.kids[0].rect, mid = h.kids[1].rect, stemB = h.kids[2].rect;
        const relMidTopPct = ((mid.y - stemA.y) / stemA.h * 100).toFixed(1);
        const midCentreVsStemCentrePct = (((mid.y + mid.h / 2) - (stemA.y + stemA.h / 2)) / stemA.h * 100).toFixed(1);
        const stagger = stemB.y - stemA.y;
        console.log('y=' + m.scrollY + '  stemA@' + stemA.y + '(' + stemA.x + ',' + stemA.w + 'x' + stemA.h + ')  mid@' + mid.y + '(' + mid.x + ',' + mid.w + 'x' + mid.h + ') r=' + h.kids[1].s.radius + ' m=' + h.kids[1].s.margin + '  stemB@' + stemB.y + '  stagger=' + stagger + 'px  midTop=' + relMidTopPct + '% of stem  midCentreVsStemCentre=' + midCentreVsStemCentrePct + '%');
        console.log('   mid class: ' + h.kids[1].cls);
      } else {
        console.log('y=' + m.scrollY + '  hero composition NOT FOUND');
      }
    }
    if (info.heroCompY > 0) {
      await scrollTo(Math.max(0, info.heroCompY - 620));
      await shot('08-hero-mark-mid.png');
      await scrollTo(Math.max(0, info.heroCompY - 120));
      await shot('09-hero-mark-end.png');
    }

    console.log('\n===== PONG composition (scroll sweep) =====');
    for (const delta of [0, 300, 600, 900]) {
      const y = Math.max(0, info.pongSecTop + delta);
      await scrollTo(y);
      const m = await measure();
      const p = m.pong;
      if (p) {
        const row = p.row, stem = p.stem && p.stem.h ? p.stem : p.row, btn = p.btn.rect;
        const relTop = ((btn.y - row.y) / row.h * 100).toFixed(1);
        const midCentreVsStemCentrePct = (((btn.y + btn.h / 2) - (stem.y + stem.h / 2)) / stem.h * 100).toFixed(1);
        console.log('y=' + m.scrollY + '  row@' + row.y + '(' + row.w + 'x' + row.h + ')  dot@' + btn.y + '(' + btn.x + ',' + btn.w + 'x' + btn.h + ') r=' + p.btn.s.radius + ' m=' + p.btn.s.margin + '  midTopInRow=' + relTop + '%  midCentreVsStemCentre=' + midCentreVsStemCentrePct + '%');
        console.log('   dot class: ' + p.btn.cls);
      } else {
        console.log('y=' + m.scrollY + '  pong NOT FOUND');
      }
    }
    await shot('10-pong-mark-end.png');
  } finally {
    try { edge.kill(); } catch (e) {}
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
