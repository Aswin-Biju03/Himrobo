// Services detail overlay smoke test (headless Edge via CDP).
// Usage: node tools/smoke-services-detail.mjs [url]   (default http://localhost:3000)
// For each of the 4 services: scroll-activate the card, click the arrow button,
// verify the dialog opens with that service's detailed content, then close.
// Also exercises the ✕ button, Escape key and backdrop-click close paths.
// Writes tools/verify-shots/_svc-detail-0.png and _svc-detail-3.png
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-shots');
const SITE = process.argv[2] || 'http://localhost:3000';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9422;
const userDataDir = path.join(os.tmpdir(), 'edge-cdp-svc-' + Date.now());
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
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64'));
}
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '   [' + detail + ']' : ''}`);
};

const EXPECT = [
  ['Knowledge based consulting', ['Product Improvements', 'Manufacturing Automation', 'Design Intelligence']],
  ['Technology Solutions', ['Robotics', 'Internet of Things', 'Data Analytics', 'Swarm robots']],
  ['Recommender Systems', ['Manufacturing / Assembly Risk', 'Engineering de-skilling', 'DFMEA']],
  ['Labs / Research', ['Gesture Recognition', 'Visual Inspection', "Custom 'learning' algorithms"]],
];

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
  ok('page loaded', (await evalJs('document.title')) === 'Home | HIM Robotics', String(await evalJs('document.title')));

  // locate the services card + section
  const geo = await evalJs(`(() => {
    const card = document.querySelector('div[class*="justify-self-end bg-white"]');
    if (!card) return null;
    const sec = card.closest('section');
    return { top: sec.getBoundingClientRect().top + window.scrollY, h: sec.offsetHeight, vh: innerHeight };
  })()`);
  ok('services card found', !!geo && geo.h >= geo.vh * 3, JSON.stringify(geo));

  // arrow button present (after mount) and inside the card's bottom-right corner
  const arrow = await evalJs(`(() => {
    const card = document.querySelector('div[class*="justify-self-end bg-white"]');
    const btn = card && card.querySelector('button[data-him-detail]');
    if (!card || !btn) return null;
    const r = btn.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    return {
      inside: card.contains(btn), w: Math.round(r.width), h: Math.round(r.height),
      svg: !!btn.querySelector('svg path'),
      cardPosition: getComputedStyle(card).position,
      inBounds: r.left >= cr.left && r.right <= cr.right && r.top >= cr.top && r.bottom <= cr.bottom,
      nearCorner: cr.right - r.right <= 40 && cr.bottom - r.bottom <= 40,
    };
  })()`);
  ok('arrow button rendered in card', !!arrow && arrow.inside && arrow.w > 30 && arrow.h > 30 && arrow.svg, JSON.stringify(arrow));
  ok('arrow anchored inside card bottom-right', !!arrow && arrow.cardPosition === 'relative' && arrow.inBounds === true && arrow.nearCorner === true, JSON.stringify(arrow));

  const openDetail = async () => evalJs(`(() => {
    const btn = document.querySelector('button[data-him-detail]');
    if (!btn) return 'no arrow';
    btn.click(); return 'clicked';
  })()`);
  const readDialog = () => evalJs(`(() => {
    const d = document.querySelector('dialog[data-him-svc-dialog]');
    if (!d) return { open: false };
    return {
      open: d.open === true,
      title: (d.querySelector('.text-heading-4') || {}).innerText || '',
      lis: d.querySelectorAll('li').length,
      chips: d.querySelectorAll('span[style*="border"]').length,
      text: (d.innerText || '').slice(0, 4000),
    };
  })()`);
  const closeDetail = () => evalJs(`(() => {
    const b = document.querySelector('button[data-him-svc-close]');
    if (!b) return 'no close btn';
    b.click(); return 'clicked close';
  })()`);
  const dialogGone = () => evalJs(`(() => {
    const d = document.querySelector('dialog[data-him-svc-dialog]');
    return !(d && d.open);
  })()`);

  // -------------------------------------------------- scroll through all 4 services
  for (let i = 0; i < 4; i++) {
    const [expectedTitle, needles] = EXPECT[i];
    // self-correcting scroll (layout may shift between measurement and scroll)
    const scr = await evalJs(`(async () => {
      const card = document.querySelector('div[class*="justify-self-end bg-white"]');
      const sec = card.closest('section');
      const frac = ${(i + 0.5) / 4};
      const measure = () => sec.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: measure() + (sec.offsetHeight - innerHeight) * frac, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 400));
      const top2 = measure();
      window.scrollTo({ top: top2 + (sec.offsetHeight - innerHeight) * frac, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 1400));
      return { y: Math.round(window.scrollY), secTop: Math.round(measure()), secH: sec.offsetHeight, vh: innerHeight };
    })()`, true);
    console.log('  scroll:', JSON.stringify(scr));
    const want = scr && Math.round(scr.secTop + (scr.secH - scr.vh) * ((i + 0.5) / 4));
    ok(`svc ${i}: scrolled to target`, !!scr && Math.abs(scr.y - want) <= 60, JSON.stringify({ got: scr && scr.y, want }));
    const active = await evalJs(`(() => {
      const card = document.querySelector('div[class*="justify-self-end bg-white"]');
      const blocks = [...card.querySelectorAll('[data-is-active]')].filter((b) => b.querySelector('h3'));
      const el = blocks.find((b) => b.getAttribute('data-is-active') === 'true');
      return el ? el.querySelector('h3').innerText.trim() : null;
    })()`);
    ok(`svc ${i}: card active = "${expectedTitle}"`, active === expectedTitle, String(active));

    await openDetail();
    await sleep(700);
    const d = await readDialog();
    ok(`svc ${i}: dialog open`, d.open === true, JSON.stringify(d).slice(0, 160));
    ok(`svc ${i}: dialog title`, d.title === expectedTitle, d.title);
    ok(`svc ${i}: bullets rendered (li>=2)`, (d.lis || 0) >= 2, 'lis=' + d.lis);
    ok(`svc ${i}: chips rendered`, (d.chips || 0) >= 3, 'chips=' + d.chips);
    const missing = needles.filter((n) => !(d.text || '').includes(n));
    ok(`svc ${i}: detail content (${needles.length} needles)`, missing.length === 0, 'missing: ' + missing.join(' | '));

    if (i === 0) {
      const tree = await evalJs(`(() => {
        const d = document.querySelector('dialog[data-him-svc-dialog]');
        if (!d || !d.open) return null;
        const nodes = d.querySelectorAll('.himtree').length;
        const nested = d.querySelector('.himtree ul ul');
        const kids = [...d.querySelectorAll('.himtree ul ul > li')];
        const cs = (el, pe, prop) => (el ? getComputedStyle(el, pe)[prop] : null);
        return {
          nodes,
          parentDrop: cs(nested, '::before', 'borderLeftWidth'),
          firstBus: cs(kids[0], '::after', 'borderTopWidth'),
          firstDrop: cs(kids[0], '::after', 'borderLeftWidth'),
          lastDrop: cs(kids[kids.length - 1], '::before', 'borderRightWidth'),
        };
      })()`);
      ok('svc 0: tree connector lines (parent + bus + drops)', !!tree && tree.nodes === 2 && tree.parentDrop === '1px' && tree.firstBus === '1px' && tree.firstDrop === '1px' && tree.lastDrop === '1px', JSON.stringify(tree));
      const anim = await evalJs(`(() => {
        const d = document.querySelector('dialog[data-him-svc-dialog]');
        if (!d || !d.open) return null;
        const w = d.querySelector('.him-svc-wrap');
        const p = d.querySelector('.him-svc-panel');
        const ds = getComputedStyle(d), ps = p ? getComputedStyle(p) : null;
        return {
          dialogTrans: ds.transitionProperty,
          dialogDur: ds.transitionDuration,
          panelTrans: ps ? ps.transitionProperty : null,
          panelDur: ps ? ps.transitionDuration : null,
          dim: w ? getComputedStyle(w).backgroundColor.indexOf('rgba(0, 0, 0') === 0 : false,
        };
      })()`);
      ok('svc 0: dialog open animation (fade + pop) + backdrop dim', !!anim && anim.dialogTrans.indexOf('display') >= 0 && anim.dialogTrans.indexOf('opacity') >= 0 && anim.dialogDur.indexOf('0.26s') >= 0 && String(anim.panelTrans).indexOf('transform') >= 0 && String(anim.panelDur).indexOf('0.34s') >= 0 && anim.dim === true, JSON.stringify(anim));
    }

    if (i === 0) await shot('_svc-detail-0.png');
    if (i === 1) await shot('_svc-detail-1.png');
    if (i === 3) await shot('_svc-detail-3.png');

    await closeDetail();
    await sleep(500);
    ok(`svc ${i}: close button works`, await dialogGone(), '');
  }

  // -------------------------------------------------- escape key close
  console.log('\n--- close paths ---');
  await evalJs(`new Promise(r => { window.scrollTo({ top: ${Math.round(geo.top + (geo.h - geo.vh) * 0.875)}, behavior: 'instant' }); setTimeout(r, 1200); })`, true);
  await openDetail();
  await sleep(600);
  ok('reopen for Esc (dialog open)', (await readDialog()).open === true, '');
  for (const type of ['rawKeyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  }
  await sleep(600);
  ok('escape key closes', await dialogGone(), '');

  // -------------------------------------------------- backdrop click close
  await openDetail();
  await sleep(600);
  const preBackdrop = await evalJs(`(() => {
    const d = document.querySelector('dialog[data-him-svc-dialog]');
    const el = document.elementFromPoint(8, 8);
    return { open: !!d && d.open, at88: el ? el.tagName + (el === d ? '=dialog' : '') : 'none' };
  })()`);
  console.log('  backdrop pre:', JSON.stringify(preBackdrop));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 8, y: 8, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 8, y: 8, button: 'left', clickCount: 1 });
  await sleep(600);
  ok('backdrop click closes', await dialogGone(), JSON.stringify(preBackdrop));

  // -------------------------------------------------- console
  const fatal = events.filter((e) => !/THREE\.Clock/.test(e));
  ok('no console errors (Three.Clock deprecations ignored)', fatal.length === 0, fatal.slice(0, 4).join(' || '));

  console.log('\n===== summary =====');
  const fails = results.filter((r) => !r.pass).length;
  console.log(`checks: ${results.length}, failures: ${fails}`);
  console.log(`console events: ${events.length}`);
  for (const e of events.slice(0, 10)) console.log('  ' + e);
  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL CHECKS PASSED');
  process.exitCode = fails ? 2 : 0;
  proc.kill();
  sock.close();
  process.exit(process.exitCode);
}
main().catch((e) => { console.error('ERR', e.message); if (proc) proc.kill(); process.exit(1); });
