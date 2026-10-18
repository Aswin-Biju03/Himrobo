// Inject the WebGL context-loss self-recovery script into the home page, idempotently.
//
// Why: on this machine the browser's GPU process can restart (e.g. while a
// fullscreen game switches display modes, or after the graphics process hangs).
// Every live WebGL canvas in every open tab then dies silently and stays blank
// until a manual reload — three.js never rebuilds a killed context. The script
// public/him-ctx-recovery.js detects exactly that state (a canvas that is still
// mounted and on screen, with its context still lost a few seconds after the
// loss) and reloads the page once to rebuild the scenes, preserving the scroll
// position. The same script also recovers from failed 3D-model loads (the local
// server restarting while a page is open crashes the scene app blank): it
// retries a reload once the site answers again. Healthy sessions never trigger it.
//
// Usage: node tools/add-ctx-guard.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const CONTENT = path.join(root, 'content');
// Only the home page renders the WebGL scenes.
const PAGE = 'index.html';

const MARKER = '<!-- him-ctx-guard -->';
const TAG = '<script src="/him-ctx-recovery.js" defer></script>';

let fail = 0;
const ok = (cond, label, detail = '') => {
  console.log((cond ? 'ok   ' : 'FAIL ') + label + (detail ? ' [' + detail + ']' : ''));
  if (!cond) fail = 1;
};

const scriptFile = path.join(root, 'public', 'him-ctx-recovery.js');
ok(
  fs.existsSync(scriptFile),
  'public/him-ctx-recovery.js exists',
  fs.existsSync(scriptFile) ? fs.statSync(scriptFile).size + ' bytes' : 'missing'
);

const file = path.join(CONTENT, PAGE);
let html = fs.readFileSync(file, 'utf8');
const before = html.length;

const bodyCloses = html.split('</body>').length - 1;
if (bodyCloses !== 1) {
  ok(false, PAGE + ': exactly one </body>', 'found ' + bodyCloses);
} else {
  const markerCount = html.split(MARKER).length - 1;
  const RENEW = new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:<script[^>]*><\\/script>)*');
  if (markerCount > 1) {
    ok(false, PAGE + ': duplicate him-ctx-guard markers', String(markerCount));
  } else if (RENEW.test(html)) {
    html = html.replace(RENEW, MARKER + TAG); // refresh tag (idempotent re-run)
  } else if (markerCount === 1) {
    ok(false, PAGE + ': partial him-ctx-guard block, fix manually');
  } else {
    html = html.replace('</body>', MARKER + TAG + '</body>');
  }

  // Validations before write.
  const injected = html.split(MARKER).length - 1;
  const tags = html.match(/<script src="\/him-ctx-recovery\.js" defer><\/script>/g) || [];
  const checks =
    injected === 1 &&
    tags.length === 1 &&
    html.split('</body>').length - 1 === 1 &&
    html.split('</html>').length - 1 === 1;
  if (!checks) {
    ok(false, PAGE + ': post-inject structure', 'marker=' + injected + ' tags=' + tags.length);
  } else {
    if (!DRY) fs.writeFileSync(file, html);
    ok(true, PAGE + (DRY ? ': would inject (dry)' : ': injected'), before + ' -> ' + html.length + ' bytes');
  }
}

console.log(DRY ? (fail ? 'DRY RUN — with failures' : 'DRY RUN — all good') : (fail ? 'FAILED' : 'done'));
process.exit(fail);
