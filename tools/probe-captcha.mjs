// Temp probe: determine the type of the registered reCAPTCHA site key and whether it
// works from localhost. Tests:
//   A) auto-render v2 checkbox with the real site key  -> screenshot + console log
//   B) v3 grecaptcha.execute with the real site key    -> prints token / error
//   C) siteverify with the given secret + dummy token  -> validates the secret key
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';

const SITEKEY = '6LcQMFUtAAAAAHoTVd1KQ1JpDZ8i_5JWDTe25RPJ';
const SECRET = '6LcQMFUtAAAAAC8a5hxccZ9c6ehS4T_mclpV1ptg';

const PAGE_A = `<!doctype html><html><head><meta charset="utf-8"><title>probe-a</title>
<script src="https://www.google.com/recaptcha/api.js" async defer></script>
</head><body style="background:#fff;font:14px sans-serif">
<h3>reCAPTCHA probe A (v2 checkbox auto-render, real key)</h3>
<div class="g-recaptcha" data-sitekey="${SITEKEY}"></div>
</body></html>`;

const PAGE_B = `<!doctype html><html><head><meta charset="utf-8"><title>probe-b</title>
<script src="https://www.google.com/recaptcha/api.js?render=${SITEKEY}"></script>
</head><body style="background:#fff;font:14px sans-serif">
<h3>reCAPTCHA probe B (v3 execute, real key)</h3>
<div id="out">waiting</div>
<script>
window.addEventListener('load', function(){
  try {
    grecaptcha.ready(function(){
      grecaptcha.execute(${JSON.stringify(SITEKEY)}, {action:'probe'})
        .then(function(t){ document.getElementById('out').textContent = 'V3 TOKEN OK :: ' + String(t).slice(0,50); })
        .catch(function(e){ document.getElementById('out').textContent = 'V3 ERROR :: ' + e; });
    });
  } catch (e) { document.getElementById('out').textContent = 'V3 THROWN :: ' + e; }
});
</script></body></html>`;

// --- static probe server on 3999 ---
const probeServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(req.url.startsWith('/b') ? PAGE_B : PAGE_A);
});
await new Promise((r) => probeServer.listen(3999, r));
console.log('probe server on http://localhost:3999');

// --- test C: siteverify the secret key ---
try {
  const body = new URLSearchParams({ secret: SECRET, response: 'dummy-token' });
  const r = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body });
  console.log('C) siteverify secret check ->', JSON.stringify(await r.json()));
} catch (e) {
  console.log('C) siteverify failed:', e.message);
}

// --- CDP browser ---
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9424;
const userDataDir = path.join(os.tmpdir(), 'edge-captcha-probe-' + Date.now());
let proc, msgId = 0, pending = new Map(), sock, sessionId;
const consoleMsgs = [];
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
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
  return r.result.value;
}

proc = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--window-size=900,600', 'about:blank'], { stdio: 'ignore' });
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
  } else if (m.method === 'Runtime.consoleAPICalled') {
    consoleMsgs.push('console.' + m.params.type + ': ' + m.params.args.map((a) => String(a.value ?? a.description ?? '')).join(' ').slice(0, 300));
  } else if (m.method === 'Log.entryAdded') {
    consoleMsgs.push('log[' + m.params.entry.level + ']: ' + m.params.entry.text.slice(0, 300));
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleMsgs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 300));
  }
};
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
sessionId = sid;
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });

// --- test A ---
await send('Page.navigate', { url: 'http://localhost:3999/a' });
await sleep(6000);
const aState = await evalJs(`(() => {
  const d = document.querySelector('.g-recaptcha');
  const f = d && d.querySelector('iframe');
  return { grecaptcha: typeof window.grecaptcha, widgetChildren: d ? d.children.length : -1, iframeSrc: f ? f.src.slice(0, 120) : null, rect: d ? (r => ({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}))(d.getBoundingClientRect()) : null };
})()`);
console.log('A) state:', JSON.stringify(aState));
if (aState && aState.rect) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: aState.rect.x - 8, y: aState.rect.y - 8, width: Math.max(aState.rect.w + 16, 320), height: Math.max(aState.rect.h + 16, 100), scale: 2 } });
  fs.writeFileSync(path.join('tools', 'verify-shots', '_captcha-a.png'), Buffer.from(data, 'base64'));
  console.log('A) screenshot saved: tools/verify-shots/_captcha-a.png');
}

// --- test B ---
await send('Page.navigate', { url: 'http://localhost:3999/b' });
let bOut = '';
for (let i = 0; i < 24; i++) {
  await sleep(500);
  bOut = await evalJs(`document.getElementById('out') ? document.getElementById('out').textContent : ''`);
  if (bOut && bOut !== 'waiting') break;
}
console.log('B) result:', bOut);

console.log('---- console/log messages ----');
console.log(consoleMsgs.slice(-30).join('\n') || '(none)');

proc.kill();
sock.close();
probeServer.close();
process.exit(0);
