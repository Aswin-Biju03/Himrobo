// Add Lenis smooth scrolling (v1.3.27) to the clone, idempotently.
//
//   1. vendors `lenis.min.js` from node_modules into vendor/_next/static/lenis/
//      (served by server.mjs at /_next/static/... with a plain filesystem check,
//      so no Next build/restart is needed),
//   2. writes the trimmed `lenis.css` (no `.lenis-stopped{overflow:clip}` — the
//      service dialog locks scrolling through Lenis' `stop()` wheel-prevention
//      instead, so opening it does not shift the layout by a scrollbar width)
//      and the `lenis-init.js` bootstrap (manual rAF loop, window.__lenis handle),
//   3. injects <link>/<script> tags before </body> in every content/*.html.
//
// Usage: node tools/add-lenis.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const ASSET_DIR = path.join(root, 'vendor', '_next', 'static', 'lenis');
const SRC_MIN = path.join(root, 'node_modules', 'lenis', 'dist', 'lenis.min.js');
const CONTENT = path.join(root, 'content');
const PAGES = ['index.html', 'privacy.html', 'terms-of-use.html', '404.html'];

const MARKER = '<!-- him-lenis -->';
const BLOCK =
  MARKER +
  '<link rel="stylesheet" href="/_next/static/lenis/lenis.css"/>' +
  '<script src="/_next/static/lenis/lenis.min.js"></script>' +
  '<script src="/_next/static/lenis/lenis-init.js"></script>';

const LENIS_CSS = `/* Lenis 1.3.27 base CSS (vendored), minus \`.lenis-stopped { overflow: clip }\`:
   this clone locks background scroll via Lenis' \`stop()\` (which prevents wheel
   default) instead of hiding the root scrollbar, so opening a dialog does not
   shift the layout by the scrollbar width. */
html.lenis,
html.lenis body {
  height: auto;
}

.lenis [data-lenis-prevent],
.lenis [data-lenis-prevent-wheel],
.lenis [data-lenis-prevent-touch],
.lenis [data-lenis-prevent-vertical],
.lenis [data-lenis-prevent-horizontal] {
  overscroll-behavior: contain;
}

.lenis.lenis-smooth iframe {
  pointer-events: none;
}
`;

const LENIS_INIT = `// HIM Robotics — Lenis smooth scrolling bootstrap (loads right after lenis.min.js).
//
// - Wheel smoothing only (\`smoothWheel\`); touch devices keep native scrolling.
// - \`respectReducedMotion\` (Lenis default) disables smoothing for users who ask
//   for reduced motion.
// - rAF loop is driven manually (\`autoRaf: false\`) so exactly one loop runs.
// - \`window.__lenis\` exposes the instance (tests + the service dialog pauses it
//   while open so the blurred page behind a modal does not scroll).
// - \`anchors: true\` makes in-page anchor links scroll smoothly.
(function () {
  function boot() {
    if (!window.Lenis || window.__lenis) return;
    var lenis = new window.Lenis({
      autoRaf: false,
      smoothWheel: true,
      anchors: true,
    });
    var raf = function (time) {
      lenis.raf(time);
      window.requestAnimationFrame(raf);
    };
    window.requestAnimationFrame(raf);
    window.__lenis = lenis;
  }
  // Wait for \`load\` so the captured page has hydrated before classes are added
  // to <html> and wheel handling starts.
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
`;

let fail = 0;
const ok = (cond, label, detail = '') => {
  console.log((cond ? 'ok   ' : 'FAIL ') + label + (detail ? ' [' + detail + ']' : ''));
  if (!cond) fail = 1;
};

// ---------------------------------------------------------------- 1. assets
if (!fs.existsSync(SRC_MIN)) {
  console.error('lenis.min.js not found in node_modules — run `npm install lenis` first.');
  process.exit(1);
}
const min = fs.readFileSync(SRC_MIN);
ok(min.length > 10000, 'lenis.min.js source sane', min.length + ' bytes');
ok(min.includes('1.3.27'), 'lenis.min.js version 1.3.27');

if (!DRY) {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  fs.writeFileSync(path.join(ASSET_DIR, 'lenis.min.js'), min);
  fs.writeFileSync(path.join(ASSET_DIR, 'lenis.css'), LENIS_CSS);
  fs.writeFileSync(path.join(ASSET_DIR, 'lenis-init.js'), LENIS_INIT);
}
ok(fs.existsSync(path.join(ASSET_DIR, 'lenis.min.js')) || DRY, 'asset lenis.min.js present');
ok(fs.existsSync(path.join(ASSET_DIR, 'lenis.css')) || DRY, 'asset lenis.css present');
ok(fs.existsSync(path.join(ASSET_DIR, 'lenis-init.js')) || DRY, 'asset lenis-init.js present');

// ------------------------------------------------------------- 2. inject html
const RENEW = new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?lenis-init\\.js"></script>');
for (const page of PAGES) {
  const file = path.join(CONTENT, page);
  let html = fs.readFileSync(file, 'utf8');
  const before = html.length;

  const bodyCloses = html.split('</body>').length - 1;
  if (bodyCloses !== 1) {
    ok(false, page + ': exactly one </body>', 'found ' + bodyCloses);
    continue;
  }
  const markerCount = html.split(MARKER).length - 1;
  if (markerCount > 1) {
    ok(false, page + ': duplicate him-lenis markers', String(markerCount));
    continue;
  }
  if (RENEW.test(html)) {
    html = html.replace(RENEW, BLOCK); // refresh tags (idempotent re-run)
  } else if (markerCount === 1) {
    ok(false, page + ': partial him-lenis block, fix manually');
    continue;
  } else {
    html = html.replace('</body>', BLOCK + '</body>');
  }

  // Validations before write.
  const checks =
    html.split(MARKER).length - 1 === 1 &&
    (html.split('</body>').length - 1) === 1 &&
    (html.split('</html>').length - 1) === 1 &&
    html.includes('lenis.min.js') &&
    html.includes('lenis-init.js') &&
    html.includes('lenis.css');
  if (!checks) {
    ok(false, page + ': post-inject structure');
    continue;
  }
  if (!DRY) fs.writeFileSync(file, html);
  ok(true, page + (DRY ? ': would inject (dry)' : ': injected'), before + ' -> ' + html.length + ' bytes');
}

console.log(DRY ? (fail ? 'DRY RUN — with failures' : 'DRY RUN — all good') : (fail ? 'FAILED' : 'done'));
process.exit(fail);
