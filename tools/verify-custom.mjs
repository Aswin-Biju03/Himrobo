// End-to-end verification of the rebranded site (server on :3300 by default).
//   node tools/verify-custom.mjs [baseUrl]
// Checks: titles, hero copy, wordmark glyphs, monogram H mark, logo lockup, favicon, contact dialog, legal pages, 404,
// console/hydration errors — and saves screenshots to tools/verify-shots/.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:3300';
const SHOTS = path.join(here, 'verify-shots');
fs.mkdirSync(SHOTS, { recursive: true });

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9413;
const userDataDir = path.join(os.tmpdir(), 'edge-cdp-verify-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let msgId = 0;
const pending = new Map();
const consoleLog = [];
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
async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(BASE + '/');
      if (res.ok) return;
    } catch (e) {}
    await sleep(500);
  }
  throw new Error('server not reachable at ' + BASE);
}

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? '   [' + detail + ']' : ''}`);
};

async function main() {
  await waitForServer();
  console.log('server ok:', BASE);
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
        consoleLog.push({ type: msg.params.type, text });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        consoleLog.push({ type: 'exception', text: (d.text || '') + ' ' + (d.exception?.description || '') });
      } else if (msg.method === 'Log.entryAdded') {
        consoleLog.push({ type: msg.params.entry.level, text: msg.params.entry.text, url: msg.params.entry.url || '' });
      }
    };
    const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(ws, m, p, sessionId);
    const evalJs = async (expression, awaitPromise = false, userGesture = false) => {
      const r = await S('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture });
      if (r.exceptionDetails) return { __error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
      return r.result.value;
    };
    let shotsDone = 0;
    async function shot(name) {
      for (let a = 1; a <= 3; a++) {
        try {
          const { data } = await S('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
          console.log('  shot', name);
          shotsDone++;
          return true;
        } catch (e) {
          console.log(`  shot ${name} attempt ${a} failed: ${e.message}`);
          await sleep(1200);
        }
      }
      ok('screenshot ' + name, false, 'capture wedged');
      return false;
    }
    const scrollTo = (y, settle = 1500) =>
      evalJs(`new Promise(r => { window.scrollTo({top: ${y}, behavior: 'instant'}); setTimeout(r, ${settle}); })`, true);
    const closeDialog = async () => {
      await evalJs(`(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); return !!d; })()`);
      await sleep(700);
      const still = await evalJs(`!!document.querySelector('dialog[open]')`);
      if (still) {
        const rect = await evalJs(`(() => {
          const dlg = document.querySelector('dialog[open]');
          const btn = dlg && [...dlg.querySelectorAll('button, [role="button"]')].find((b) => /close/i.test(b.textContent || ''));
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
        })()`);
        if (rect) {
          const { x, y } = JSON.parse(rect);
          await S('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
          await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
          await sleep(800);
        }
      }
      return !(await evalJs(`!!document.querySelector('dialog[open]')`));
    };

    await S('Page.enable');
    await S('Runtime.enable');
    await S('Log.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

    // ---------------------------------------------------------------- home
    console.log('\n--- home ---');
    await S('Page.navigate', { url: BASE + '/' });
    await sleep(7000);

    const title = await evalJs('document.title');
    ok('home title', title === 'Home | HIM Robotics', String(title));

    const body = (await evalJs('document.body.innerText')) || '';
    const bodyNorm = body.replace(/\s+/g, ' ');
    ok('hero sentence', bodyNorm.includes('HIM Robotics is providing expert technology solutions to improve engineering productivity.'), '');
    ok('no legacy brand text', !/Mind Robotics|mindrobotics|Rivian|Palo Alto/i.test(body), '');
    ok('about copy (HIM who-we-are)', body.includes('Having decades of industry experience'), '');
    ok('data copy (HIM)', body.includes('Using data transformation'), '');

    // Lenis smooth scrolling (vendored 1.3.27, bootstrapped on load)
    const lenis = await evalJs(`(() => ({
      inst: !!window.__lenis,
      version: window.lenisVersion || '',
      cls: document.documentElement.classList.contains('lenis'),
      lib: typeof window.Lenis === 'function',
      css: Array.from(document.styleSheets).some((s) => { try { return /lenis-stopped|data-lenis-prevent/.test(Array.from(s.cssRules).map((r) => r.cssText).join('')); } catch (e) { return /lenis/i.test(s.href || ''); } }),
    }))()`);
    ok('lenis smooth scrolling active (instance + html.lenis + css)',
      !!lenis && lenis.inst === true && lenis.lib === true && lenis.cls === true && lenis.version === '1.3.27' && lenis.css === true,
      JSON.stringify(lenis));

    // Model GLBs preloaded at page load (scene sections mount lazily; without
    // preloads each scene only starts its `/models/*.glb` fetches when scrolled
    // into view). Still at the top here — no scrolling has happened yet.
    const preloads = await evalJs(`(() => {
      const glbs = performance.getEntriesByType('resource').filter((r) => /\\/models\\/.*\\.glb$/.test(r.name));
      return {
        dom: document.querySelectorAll('link[rel="preload"][as="fetch"][href^="/models/"]').length,
        n: glbs.length,
        names: glbs.map((r) => r.name.split('/').pop()).sort().join(','),
        early: glbs.every((r) => r.startTime < 3000),
      };
    })()`);
    const allModels = 'arm.glb,body.glb,connectors.glb,fastening.glb,hand.glb,pick-and-place.glb,sorting.glb';
    ok('model GLBs preloaded at page load (7 files, no scroll needed)',
      !!preloads && preloads.dom === 7 && preloads.n === 7 && preloads.names === allModels && preloads.early === true,
      JSON.stringify(preloads));

    const pageHtml = await evalJs('document.documentElement.outerHTML');
    ok(
      'services copy (HIM 4 services)',
      ['Knowledge based consulting', 'Technology Solutions', 'Recommender Systems', 'Labs / Research', 'Design and manufacturing intelligence', 'Robotics and Internet of Things', 'Manufacturing and assembly risk', 'Gesture recognition'].every((s) => pageHtml.includes(s)),
      ''
    );

    const wordmark = (await evalJs(`(() => {
      const a = document.querySelector('svg[viewBox="0 0 333 100"]');
      const b = document.querySelector('svg[viewBox="0 0 679 100"]');
      const label = document.querySelector('span[aria-label="HIM Robotics"]');
      return {
        himGroups: a ? a.querySelectorAll('g').length : -1,
        himPaths: a ? a.querySelectorAll('path').length : -1,
        robGroups: b ? b.querySelectorAll('g').length : -1,
        label: label ? 'ok' : 'missing',
      };
    })()`)) || {};
    ok('wordmark HIM groups=3 (H,I,M)', wordmark.himGroups === 3, JSON.stringify(wordmark));
    ok('wordmark HIM paths=8 (4 H + 2 I + 2 M)', wordmark.himPaths === 8, '');
    ok('wordmark ROBOTICS groups=8', wordmark.robGroups === 8, '');
    ok('wordmark wrapper aria-label', wordmark.label === 'ok', '');

    const monogram = (await evalJs(`(() => {
      const svgs = [...document.querySelectorAll('svg[viewBox="0 0 80 64"]')];
      return {
        count: svgs.length,
        bars: svgs.filter((s) => [...s.querySelectorAll('path')].some((p) => (p.getAttribute('d') || '').includes('M0 38.4h80V25.6H0Z'))).length,
        dots: svgs.filter((s) => [...s.querySelectorAll('path')].some((p) => (p.getAttribute('d') || '').includes('M27.2 20.485'))).length,
      };
    })()`)) || {};
    ok('monogram mark rebuilt as H (crossbar on every instance, no dot)', monogram.count >= 2 && monogram.bars === monogram.count && monogram.dots === 0, JSON.stringify(monogram));

    const logo = (await evalJs(`(() => {
      const svgs = [...document.querySelectorAll('svg[viewBox="0 0 80 64"]')];
      const withBg = svgs.filter((s) => getComputedStyle(s).backgroundImage.includes('/images/logo.png')).length;
      const hiddenPaths = svgs.every((s) => [...s.querySelectorAll('path')].every((p) => getComputedStyle(p).display === 'none'));
      return { count: svgs.length, withBg, hiddenPaths };
    })()`)) || {};
    ok('logo lockup replaces monogram (background + hidden H paths)', logo.count >= 2 && logo.withBg === logo.count && logo.hiddenPaths === true, JSON.stringify(logo));

    const favicon = await evalJs(`fetch('/favicon.svg').then((r) => r.text()).then((t) => t.slice(0, 40))`, true);
    ok('favicon is a real SVG (H mark)', typeof favicon === 'string' && favicon.startsWith('<svg') && !/PNG/.test(favicon), String(favicon).slice(0, 60));

    await shot('01-home-hero.png');

    await scrollTo(2200, 1600);
    await shot('02-home-mid.png');

    // contact dialog
    console.log('\n--- contact dialog ---');
    const clicked = await evalJs(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Contact');
      if (b) { b.click(); return true; }
      return false;
    })()`, false, true);
    ok('contact button found', clicked === true, '');
    await sleep(1600);
    const dialogText = (await evalJs('document.body.innerText')) || '';
    const fields = await evalJs(`(() => {
      const d = document.querySelector('dialog[open]');
      if (!d) return null;
      const need = ['#contact-name', '#contact-email', '#contact-mobile', '#contact-company', '#contact-service', '#contact-message'];
      return need.every((s) => !!d.querySelector(s));
    })()`);
    ok('contact dialog form fields', fields === true, JSON.stringify(fields));
    ok('contact dialog captcha + send button', /I'm not a robot/.test(dialogText) && /Send Message/.test(dialogText), '');
    const svcOptions = await evalJs(`(() => {
      const s = document.querySelector('dialog[open] #contact-service');
      return s ? [...s.options].map((o) => o.textContent) : null;
    })()`);
    ok('contact dialog service options (4 services)', Array.isArray(svcOptions) && ['Knowledge based consulting', 'Technology Solutions', 'Recommender Systems', 'Labs / Research'].every((n) => svcOptions.includes(n)), JSON.stringify(svcOptions));
    await shot('03-contact-dialog.png');
    const closed = await closeDialog();
    ok('contact dialog closes', closed === true, '');

    // services detail overlay (arrow button + per-service detail dialog)
    console.log('\n--- services detail overlay ---');
    await evalJs(`(() => {
      const card = document.querySelector('div[class*="justify-self-end bg-white"]');
      if (!card) return null;
      const sec = card.closest('section');
      const m = () => sec.getBoundingClientRect().top + scrollY;
      scrollTo({ top: m() + (sec.offsetHeight - innerHeight) * 0.125, behavior: 'instant' });
      return true;
    })()`);
    await sleep(1700);
    const svcInfo = await evalJs(`(() => {
      const card = document.querySelector('div[class*="justify-self-end bg-white"]');
      const arrow = card && card.querySelector('button[data-him-detail]');
      if (!card || !arrow) return { arrow: false, title: null };
      const r = arrow.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      const blocks = [...card.querySelectorAll('[data-is-active]')].filter((b) => b.querySelector('h3'));
      const active = blocks.find((b) => b.getAttribute('data-is-active') === 'true');
      return {
        arrow: true,
        cardPosition: getComputedStyle(card).position,
        inBounds: r.left >= cr.left && r.right <= cr.right && r.top >= cr.top && r.bottom <= cr.bottom,
        nearCorner: cr.right - r.right <= 40 && cr.bottom - r.bottom <= 40,
        title: active ? active.querySelector('h3').innerText.trim() : null,
      };
    })()`);
    ok('services detail arrow button', !!svcInfo && svcInfo.arrow === true, JSON.stringify(svcInfo));
    ok('services arrow inside card (bottom-right)', !!svcInfo && svcInfo.cardPosition === 'relative' && svcInfo.inBounds === true && svcInfo.nearCorner === true, JSON.stringify(svcInfo));
    ok('services card active (Knowledge based consulting)', !!svcInfo && svcInfo.title === 'Knowledge based consulting', String(svcInfo && svcInfo.title));
    await evalJs(`(() => { const b = document.querySelector('button[data-him-detail]'); if (b) b.click(); })()`);
    await sleep(1100);
    const svcDialog = await evalJs(`(() => {
      const d = document.querySelector('dialog[data-him-svc-dialog]');
      if (!d || !d.open) return null;
      return {
        title: (d.querySelector('.text-heading-4') || {}).innerText || '',
        lis: d.querySelectorAll('li').length,
        chips: d.querySelectorAll('span[style*="border"]').length,
      };
    })()`);
    ok('service detail dialog content', !!svcDialog && svcDialog.title === 'Knowledge based consulting' && svcDialog.lis >= 2 && svcDialog.chips >= 3, JSON.stringify(svcDialog));
    const svcTree = await evalJs(`(() => {
      const d = document.querySelector('dialog[data-him-svc-dialog]');
      if (!d || !d.open) return null;
      const nested = d.querySelector('.himtree ul ul');
      const kids = [...d.querySelectorAll('.himtree ul ul > li')];
      const cs = (el, pe, prop) => (el ? getComputedStyle(el, pe)[prop] : null);
      return {
        trees: d.querySelectorAll('.himtree').length,
        parentDrop: cs(nested, '::before', 'borderLeftWidth'),
        busTop: cs(kids[0], '::after', 'borderTopWidth'),
        firstDrop: cs(kids[0], '::after', 'borderLeftWidth'),
        lastDrop: cs(kids[kids.length - 1], '::before', 'borderRightWidth'),
      };
    })()`);
    ok('service diagram connector lines', !!svcTree && svcTree.trees >= 1 && svcTree.parentDrop === '1px' && svcTree.busTop === '1px' && svcTree.firstDrop === '1px' && svcTree.lastDrop === '1px', JSON.stringify(svcTree));
    const svcAnim = await evalJs(`(() => {
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
    ok('service dialog open animation (fade + pop + backdrop dim)', !!svcAnim && svcAnim.dialogTrans.indexOf('display') >= 0 && svcAnim.dialogTrans.indexOf('opacity') >= 0 && svcAnim.dialogDur.indexOf('0.26s') >= 0 && String(svcAnim.panelTrans).indexOf('transform') >= 0 && String(svcAnim.panelDur).indexOf('0.34s') >= 0 && svcAnim.dim === true, JSON.stringify(svcAnim));
    await shot('03b-services-detail.png');
    await evalJs(`(() => { const b = document.querySelector('button[data-him-svc-close]'); if (b) b.click(); })()`);
    const svcExit = await evalJs(`new Promise((r) => {
      const t0 = performance.now();
      (function poll() {
        const d = document.querySelector('dialog[data-him-svc-dialog]');
        if (!d) { r({ gone: true }); return; }
        if (d.open !== true) {
          r({ open: false, display: getComputedStyle(d).display, ms: Math.round(performance.now() - t0) });
          return;
        }
        if (performance.now() - t0 > 900) { r({ open: true, timeout: true }); return; }
        setTimeout(poll, 10);
      })();
    })`, true);
    ok('service dialog plays exit transition (open=false, still rendered)', !!svcExit && svcExit.open === false && svcExit.display !== 'none', JSON.stringify(svcExit));
    await sleep(700);
    const svcClosed = await evalJs(`(() => { const d = document.querySelector('dialog[data-him-svc-dialog]'); return !(d && d.open); })()`);
    ok('service detail dialog closes', svcClosed === true, '');

    // bottom (outro + footer)
    console.log('\n--- outro + footer ---');
    await scrollTo(999999, 2400);
    await sleep(1200);
    await shot('04-home-bottom.png');
    const bottomText = ((await evalJs('document.body.innerText')) || '').replace(/\n+/g, ' ');
    ok('outro says HIM', /Get to\s*know\s*HIM/.test(bottomText), '');
    ok('footer copyright HIM', /HIM Robotics/.test(bottomText), '');

    // ---------------------------------------------------------------- privacy
    console.log('\n--- privacy ---');
    await S('Page.navigate', { url: BASE + '/privacy' });
    await sleep(4000);
    const pTitle = await evalJs('document.title');
    const pText = (await evalJs('document.body.innerText')) || '';
    const pHead = (await evalJs("(document.querySelector('h1')||{}).innerText || ''")) || '';
    ok('privacy title', /Privacy/i.test(pTitle) && pTitle.includes('HIM Robotics'), String(pTitle));
    ok('privacy h1', /Privacy/i.test(pHead) && !/Mind Robotics/.test(pHead), pHead.replace(/\s+/g, ' ').slice(0, 80));
    ok('privacy no legacy', !/Mind Robotics|mindrobotics\.com|press@/i.test(pText), '');
    ok('privacy entity HIM Robotics LLP', pText.includes('HIM Robotics LLP'), '');
    await shot('05-privacy-top.png');

    // ---------------------------------------------------------------- terms
    console.log('\n--- terms ---');
    await S('Page.navigate', { url: BASE + '/terms-of-use' });
    await sleep(4000);
    const tHead = (await evalJs(`(() => {
      const h = document.querySelector('h1');
      return h ? h.innerText.replace(/\\s+/g, ' ').trim() : '';
    })()`)) || '';
    const tText = (await evalJs('document.body.innerText')) || '';
    ok('terms h1 headline', tHead === 'HIM Robotics \u2013 Website Terms of Use', tHead);
    ok('terms no legacy', !/Mind Robotics|MIND ROBOTICS|mindrobotics/i.test(tText), '');
    await shot('06-terms-top.png');

    // ---------------------------------------------------------------- 404
    console.log('\n--- 404 ---');
    await S('Page.navigate', { url: BASE + '/definitely-not-a-page' });
    await sleep(3500);
    const nText = (await evalJs('document.body.innerText')) || '';
    ok('404 page', /not found|404/i.test(nText), '');
    ok('404 no legacy', !/Mind Robotics|mindrobotics/i.test(nText), '');
    await shot('07-404.png');

    // ---------------------------------------------------------------- console
    // benign by-design noise: RSC prefetch 404s (server forces full-page nav) + favicon auto-request
    const benign = (l) => /_rsc=/.test(l.url || '') || /favicon\.ico/.test(l.url || '') || /definitely-not-a-page/.test(l.url || '');
    const errors = consoleLog.filter((l) => (l.type === 'error' || l.type === 'exception') && !benign(l));
    const benignErrors = consoleLog.filter((l) => (l.type === 'error' || l.type === 'exception') && benign(l));
    const hydration = consoleLog.filter((l) => /hydrat/i.test(l.text));
    ok('no console errors', errors.length === 0, errors.slice(0, 6).map((e) => e.text.slice(0, 200)).join(' || '));
    ok('no hydration warnings', hydration.length === 0, hydration.slice(0, 3).map((e) => e.text.slice(0, 200)).join(' || '));

    console.log('\n===== summary =====');
    const fails = results.filter((r) => !r.pass).length;
    const warns = consoleLog.filter((l) => l.type === 'warning' || l.type === 'warn');
    console.log(`checks: ${results.length}, failures: ${fails}, screenshots: ${shotsDone}`);
    console.log(`console: ${consoleLog.length} messages, ${errors.length} errors (benign 404s ignored: ${benignErrors.length}), ${warns.length} warnings`);
    for (const e of errors.slice(0, 5)) console.log('  ERR  ' + e.text.slice(0, 200));
    for (const w of warns.slice(0, 5)) console.log('  WARN ' + w.text.slice(0, 160));
    console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL CHECKS PASSED');
    console.log('screenshots in ' + SHOTS);
    if (fails) process.exitCode = 2;
  } finally {
    try { edge.kill(); } catch (e) {}
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
