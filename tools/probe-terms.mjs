// Probe the terms page (and a control page) on two servers, capturing full
// console + exception + network-failure detail, to diagnose "This page couldn't load".
// usage: node tools/probe-terms.mjs [url1] [url2]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const URLS = process.argv.slice(2);
if (!URLS.length) URLS.push('http://localhost:3300/terms-of-use', 'http://localhost:3100/terms-of-use');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9414;
const userDataDir = path.join(os.tmpdir(), 'edge-cdp-probe-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    '--window-size=1600,1000', '--hide-scrollbars',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    const ws = new WebSocket(await getWsUrl());
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const events = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        events.push(`console.${msg.params.type}: ${text.slice(0, 600)}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        events.push(`EXCEPTION: ${d.text} ${(d.exception?.description || '').slice(0, 900)}`);
      } else if (msg.method === 'Log.entryAdded') {
        events.push(`log.${msg.params.entry.level} ${msg.params.entry.url || ''}: ${msg.params.entry.text.slice(0, 300)}`);
      } else if (msg.method === 'Network.loadingFailed') {
        events.push(`NET FAIL ${msg.params.requestId}: ${msg.params.errorText} (${msg.params.type})`);
      } else if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
        events.push(`HTTP ${msg.params.response.status} ${msg.params.response.url}`);
      }
    };
    const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(ws, m, p, sessionId);
    await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable'); await S('Network.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

    for (const url of URLS) {
      events.length = 0;
      console.log(`\n================ ${url} ================`);
      try {
        await S('Page.navigate', { url });
      } catch (e) {
        console.log('navigate error: ' + e.message);
        continue;
      }
      await sleep(7000);
      const state = (await S('Runtime.evaluate', {
        expression: `(() => ({
          title: document.title,
          h1: (document.querySelector('h1')||{}).innerText || null,
          errorUI: /couldn.t load/.test(document.body.innerText),
          bodyHead: document.body.innerText.slice(0, 200).replace(/\\s+/g, ' '),
        }))()`,
        returnByValue: true,
      })).result.value;
      console.log('state: ' + JSON.stringify(state));
      console.log('--- events ---');
      for (const e of events.slice(0, 40)) console.log('  ' + e);
      if (!events.length) console.log('  (none)');
    }
  } finally {
    try { edge.kill(); } catch (e) {}
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
