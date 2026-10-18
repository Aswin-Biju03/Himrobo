// Temp probe 2: compare Google's official test site key vs the user's site key,
// reading the widget's own error/status text via OOPIF attach.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';

const TESTKEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'; // official test key (always passes)
const USERKEY = '6LcQMFUtAAAAAHoTVd1KQ1JpDZ8i_5JWDTe25RPJ';

const page = (key) => `<!doctype html><html><head><meta charset="utf-8"><title>probe</title>
<script src="https://www.google.com/recaptcha/api.js" async defer></script>
</head><body style="background:#fff;font:14px sans-serif">
<h3>key probe</h3>
<div class="g-recaptcha" data-sitekey="${key}"></div>
</body></html>`;

const probeServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  const key = new URL(req.url, 'http://x').searchParams.get('key') || TESTKEY;
  res.end(page(key));
});
await new Promise((r) => probeServer.listen(3999, r));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9425;
const userDataDir = path.join(os.tmpdir(), 'edge-captcha-probe2-' + Date.now());
let proc, msgId = 0, pending = new Map(), sock, sessionId;
const frameSessions = [];
function send(method, params = {}, sid) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const t = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout:' + method)); }, 30000);
    pending.set(id, { resolve, reject });
    const payload = { id, method, params };
    const s = sid || sessionId;
    if (s) payload.sessionId = s;
    sock.send(JSON.stringify(payload));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evalJs(expression, sid) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
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
  } else if (m.method === 'Target.attachedToTarget') {
    const info = m.params.targetInfo;
    if (info.type === 'iframe' && /recaptcha/.test(info.url)) frameSessions.push(m.params.sessionId);
  }
};
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true });
sessionId = sid;
await send('Page.enable');
await send('Runtime.enable');
await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });

async function frameText() {
  for (const s of frameSessions) {
    try {
      const t = await evalJs('document.body ? document.body.innerText : ""', s);
      if (t) return String(t).replace(/\s+/g, ' ').slice(0, 200);
    } catch (e) {}
  }
  return '(no iframe text)';
}

for (const [label, key] of [['TESTKEY', TESTKEY], ['USERKEY', USERKEY]]) {
  frameSessions.length = 0;
  await send('Page.navigate', { url: 'http://localhost:3999/?key=' + key });
  await sleep(5000);
  const rect = await evalJs(`(() => { const d = document.querySelector('.g-recaptcha'); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const text = await frameText();
  console.log(label, '| iframe text:', JSON.stringify(text));

  // try clicking the checkbox spot (checkbox sits ~ left+28, top+38 inside the 304x78 anchor)
  let clicked = null;
  if (rect) {
    const cx = rect.x + 28, cy = rect.y + 38;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
    await sleep(3500);
    clicked = await evalJs(`window.grecaptcha && grecaptcha.getResponse ? (grecaptcha.getResponse() || '').slice(0, 30) : 'no-api'`);
    console.log(label, '| token after click:', JSON.stringify(clicked));
    console.log(label, '| iframe text after click:', JSON.stringify(await frameText()));
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max((rect?.x ?? 8) - 8, 0), y: Math.max((rect?.y ?? 50) - 8, 0), width: 330, height: Math.max((rect?.h ?? 80) + 16, 100), scale: 2 } });
  fs.writeFileSync(path.join('tools', 'verify-shots', `_captcha-${label.toLowerCase()}.png`), Buffer.from(data, 'base64'));
}

proc.kill();
sock.close();
probeServer.close();
process.exit(0);
