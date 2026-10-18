// Temp probe 3: get a token from the official test key, then siteverify it with
// (a) the official test secret and (b) the user's real secret.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';

const TESTKEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
const TESTSECRET = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';
const USERSECRET = '6LcQMFUtAAAAAC8a5hxccZ9c6ehS4T_mclpV1ptg';

const probeServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8">
<script src="https://www.google.com/recaptcha/api.js" async defer></script>
</head><body style="background:#fff"><div class="g-recaptcha" data-sitekey="${TESTKEY}"></div></body></html>`);
});
await new Promise((r) => probeServer.listen(3999, r));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9426;
const userDataDir = path.join(os.tmpdir(), 'edge-captcha-probe3-' + Date.now());
let proc, msgId = 0, pending = new Map(), sock, sessionId;
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
  }
};
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
sessionId = sid;
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:3999/' });
await sleep(5000);
const rect = await evalJs(`(() => { const d = document.querySelector('.g-recaptcha'); const r = d.getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x + 28, y: rect.y + 38, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x + 28, y: rect.y + 38, button: 'left', clickCount: 1 });
let token = '';
for (let i = 0; i < 20; i++) {
  await sleep(800);
  token = await evalJs(`window.grecaptcha ? (grecaptcha.getResponse() || '') : ''`);
  if (token) break;
}
console.log('token length:', String(token).length);
for (const [label, secret] of [['TEST secret', TESTSECRET], ['USER secret', USERSECRET]]) {
  try {
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body: new URLSearchParams({ secret, response: String(token) }) });
    console.log(label, '->', JSON.stringify(await r.json()));
  } catch (e) { console.log(label, 'fetch failed:', e.message); }
}
proc.kill();
sock.close();
probeServer.close();
process.exit(0);
