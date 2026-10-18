// Contact-form + 3D smoke test (headless Edge via CDP).
// Usage: node tools/smoke-contact.mjs [url]     (default http://localhost:3300)
// Writes tools/verify-shots/_smoke-hero.png / _smoke-services.png / _smoke-dialog.png
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-shots');
const SITE = process.argv[2] || 'http://localhost:3300';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9421;
const userDataDir = path.join(os.tmpdir(), 'edge-cdp-smoke-' + Date.now());
let proc, msgId = 0, pending = new Map(), sock, sessionId;
const events = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const t = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout:' + method)); }, 30000);
    pending.set(id, { resolve, reject });
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    sock.send(JSON.stringify(payload));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evalJs(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
  return r.result.value;
}

async function main() {
  proc = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--enable-unsafe-swiftshader', '--window-size=1600,1000', 'about:blank',
  ], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (res.ok) { wsUrl = (await res.json()).webSocketDebuggerUrl; break; } } catch (e) {}
    await sleep(400);
  }
  if (!wsUrl) throw new Error('Edge CDP not reachable');
  sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  sock.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      events.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      events.push(m.params.type.toUpperCase() + ': ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 260));
    }
  };
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
  sessionId = sid;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: SITE + '/' });
  await sleep(9000);
  console.log('location:', await evalJs('window.location.href'));

  const canvases = await evalJs(`(() => { const cs = [...document.querySelectorAll('canvas')]; return cs.map((c) => ({ w: c.width, h: c.height })); })()`);
  console.log('canvases at top:', JSON.stringify(canvases));
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, '_smoke-hero.png'), Buffer.from(shot.data, 'base64'));

  await evalJs(`new Promise(r => { window.scrollTo({ top: 2600, behavior: 'instant' }); setTimeout(r, 3000); })`, true);
  console.log('canvas count after scroll:', await evalJs(`document.querySelectorAll('canvas').length`));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, '_smoke-services.png'), Buffer.from(shot.data, 'base64'));

  const clicked = await evalJs(`(() => { const b = Array.from(document.querySelectorAll('button,a')).find((x) => (x.textContent || '').trim() === 'Contact'); if (b) { b.click(); return 'clicked ' + b.tagName; } return 'not found'; })()`);
  console.log('contact click:', JSON.stringify(clicked));
  await sleep(2500);
  const dlg = await evalJs(`(() => {
    const d = document.querySelector('dialog[open]');
    if (!d) return { open: false };
    const fe = (s) => !!d.querySelector(s);
    const sel = d.querySelector('#contact-service');
    return {
      open: true,
      name: fe('#contact-name'), email: fe('#contact-email'), mobile: fe('#contact-mobile'),
      company: fe('#contact-company'), service: fe('#contact-service'), message: fe('#contact-message'),
      captcha: /I'm not a robot/.test(d.innerText), send: /Send Message/.test(d.innerText),
      options: sel ? [...sel.options].map((o) => o.textContent) : null,
    };
  })()`);
  console.log('dialog:', JSON.stringify(dlg, null, 1));
  console.log('location after click:', await evalJs('window.location.href'));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, '_smoke-dialog.png'), Buffer.from(shot.data, 'base64'));

  // exercise submit (happy path)
  await evalJs(`(() => {
    const d = document.querySelector('dialog[open]');
    if (!d) return 'no dialog';
    window.__alerts = [];
    window.__oldAlert = window.alert;
    window.alert = (m) => { window.__alerts.push(String(m)); };
    const set = (sel, v) => { const el = d.querySelector(sel); el.value = v; };
    set('#contact-name', 'Test User');
    set('#contact-email', 'test@example.com');
    set('#contact-mobile', '1234567890');
    set('#contact-company', 'Acme');
    d.querySelector('#contact-service').value = 'Technology Solutions';
    d.querySelector('input[name=captcha]').checked = true;
    d.querySelector('form').requestSubmit();
    return 'submitted';
  })()`);
  await sleep(1200);
  const submitResult = await evalJs(`({ alerts: window.__alerts || [], open: !!document.querySelector('dialog[open]') })`);
  console.log('submit test:', JSON.stringify(submitResult));

  // re-open: captcha guard + close button
  await evalJs(`(() => { const b = Array.from(document.querySelectorAll('button,a')).find((x) => (x.textContent || '').trim() === 'Contact'); if (b) b.click(); })()`);
  await sleep(1500);
  const guard = await evalJs(`(() => {
    const d = document.querySelector('dialog[open]');
    if (!d) return 'no dialog';
    window.__alerts = [];
    const set = (sel, v) => { const el = d.querySelector(sel); el.value = v; };
    set('#contact-name', 'A'); set('#contact-email', 'a@b.com');
    d.querySelector('#contact-service').value = 'Labs / Research';
    d.querySelector('form').requestSubmit(); // captcha unchecked -> must be blocked
    return 'requested';
  })()`);
  await sleep(800);
  const guardResult = await evalJs(`({ alerts: window.__alerts || [], open: !!document.querySelector('dialog[open]') })`);
  console.log('captcha guard:', guard, '->', JSON.stringify(guardResult));
  const closeRes = await evalJs(`(() => {
    const d = document.querySelector('dialog[open]');
    const btn = d && [...d.querySelectorAll('button')].find((b) => /close/i.test(b.textContent || ''));
    if (!btn) return 'no close button';
    btn.click();
    return 'clicked close';
  })()`);
  await sleep(1200);
  console.log('close button:', closeRes, '| dialog open now:', await evalJs(`!!document.querySelector('dialog[open]')`));
  await evalJs(`(() => { if (window.__oldAlert) window.alert = window.__oldAlert; })()`);

  console.log('--- console events (' + events.length + ') ---');
  for (const e of events.slice(0, 40)) console.log(e);

  proc.kill();
  sock.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); if (proc) proc.kill(); process.exit(1); });
