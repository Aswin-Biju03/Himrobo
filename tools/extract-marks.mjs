// Extract the hero wordmark glyph data ("mind" + "robotics" marks) from the compiled
// client chunk, compose the replacement "HIM" letter set, and emit:
//   - tools/marks-extracted.json  (original glyphs, for reference)
//   - tools/marks-him.json        (new letters: H, I, M)
//   - tools/marks-preview.html    (visual check page — screenshot with tools/shot.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'vendor/_next/static/chunks/2tvcy0m4g8gry.js'), 'utf8');

function extractArray(src, startIdx) {
  let depth = 0, i = startIdx, inStr = false, q = '';
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === q) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unterminated array');
}

const mindMarker = 'p={mind:{viewBox:"0 0 333 ".concat(100),letters:';
const mindAt = SRC.indexOf(mindMarker);
if (mindAt < 0) throw new Error('mind marker not found');
const mindArr = JSON.parse(extractArray(SRC, SRC.indexOf('[', mindAt + mindMarker.length - 1)));

const robMarker = ',robotics:{viewBox:"0 0 679 ".concat(100),letters:';
const robAt = SRC.indexOf(robMarker);
if (robAt < 0) throw new Error('robotics marker not found');
const robArr = JSON.parse(extractArray(SRC, SRC.indexOf('[', robAt + robMarker.length - 1)));

// ---------------- SVG path translation (full absolute rewrite) ----------------
export function translatePath(d, dx, dy) {
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  const t = [];
  let m;
  while ((m = re.exec(d))) t.push(m[1] ? m[1] : parseFloat(m[2]));
  let i = 0, out = '';
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const fmt = (n) => {
    const r = Math.round(n * 1000) / 1000;
    return Object.is(r, -0) ? '0' : String(r);
  };
  const num = () => t[i++];
  while (i < t.length) {
    const cmd = t[i++];
    if (typeof cmd !== 'string') throw new Error('path parse: expected command, got ' + cmd);
    const abs = cmd.toUpperCase();
    const rel = cmd !== abs;
    switch (abs) {
      case 'M': {
        let first = true;
        while (i < t.length && typeof t[i] === 'number') {
          let x = num(), y = num();
          if (rel) { x += cx; y += cy; }
          cx = x; cy = y;
          if (first) { sx = cx; sy = cy; out += `M${fmt(cx + dx)} ${fmt(cy + dy)}`; first = false; }
          else out += `L${fmt(cx + dx)} ${fmt(cy + dy)}`;
        }
        break;
      }
      case 'L':
        while (i < t.length && typeof t[i] === 'number') {
          let x = num(), y = num();
          if (rel) { x += cx; y += cy; }
          cx = x; cy = y;
          out += `L${fmt(cx + dx)} ${fmt(cy + dy)}`;
        }
        break;
      case 'H':
        while (i < t.length && typeof t[i] === 'number') {
          let x = num();
          if (rel) x += cx;
          cx = x;
          out += `L${fmt(cx + dx)} ${fmt(cy + dy)}`;
        }
        break;
      case 'V':
        while (i < t.length && typeof t[i] === 'number') {
          let y = num();
          if (rel) y += cy;
          cy = y;
          out += `L${fmt(cx + dx)} ${fmt(cy + dy)}`;
        }
        break;
      case 'C':
        while (i < t.length && typeof t[i] === 'number') {
          let x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
          if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
          out += `C${fmt(x1 + dx)} ${fmt(y1 + dy)} ${fmt(x2 + dx)} ${fmt(y2 + dy)} ${fmt(x + dx)} ${fmt(y + dy)}`;
          cx = x; cy = y;
        }
        break;
      case 'S':
        while (i < t.length && typeof t[i] === 'number') {
          let x2 = num(), y2 = num(), x = num(), y = num();
          if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
          out += `S${fmt(x2 + dx)} ${fmt(y2 + dy)} ${fmt(x + dx)} ${fmt(y + dy)}`;
          cx = x; cy = y;
        }
        break;
      case 'A':
        while (i < t.length && typeof t[i] === 'number') {
          const rx = num(), ry = num(), rot = num(), laf = num(), sf = num();
          let x = num(), y = num();
          if (rel) { x += cx; y += cy; }
          out += `A${fmt(rx)} ${fmt(ry)} ${fmt(rot)} ${laf} ${sf} ${fmt(x + dx)} ${fmt(y + dy)}`;
          cx = x; cy = y;
        }
        break;
      case 'Z':
        out += 'Z';
        cx = sx; cy = sy;
        break;
      default:
        throw new Error('unsupported command ' + abs);
    }
  }
  return out;
}

// ---------------- compose "HIM" ----------------
// Original positions: m 0..~104, i 117.3..137.9, n 153.3..234.8, d 245.8..332.3 (viewBox 333x100)
const mindM = mindArr[0][0];
const mindI = mindArr[1][0];

const H_W = 90;                                  // H width
const bar1 = translatePath(mindI, 10.298 - 127.64, 0);    // left stem, x 0..20.6
const bar2 = translatePath(mindI, 79.698 - 127.64, 0);    // right stem, x 69.4..90
// crossbar variants:
//  A: rounded end caps (first attempt)
//  B: plain rectangle drawn opposite direction to the stems (robust vs winding)
const crossA = 'M10.298 38.8345C4.611 38.8345 0 43.4445 0 49.1345c0 5.688 4.611 10.298 10.298 10.298h69.404c5.687 0 10.298-4.61 10.298-10.298c0-5.689-4.611-10.3-10.298-10.3H10.298Z';
const crossB = 'M0 59.4345h90V38.8345H0Z';
const crossFlat = 'M0 38.8345h90v20.6H0Z';
const H = [bar1, bar2, crossB];

const GAP = 15.3;
const I_dx = (H_W + GAP) - 117.342;              // place I right after H
const I = [translatePath(mindI, I_dx, 0)];
const M_dx = (H_W + GAP + 20.596 + GAP) - 0;     // place M after I
const M = [translatePath(mindM, M_dx, 0)];

const himLetters = [H, I, M];
const him = { viewBox: '0 0 333 100', letters: himLetters };

fs.writeFileSync(path.join(here, 'marks-extracted.json'), JSON.stringify({ mind: mindArr, robotics: robArr }, null, 2));
fs.writeFileSync(path.join(here, 'marks-him.json'), JSON.stringify(him, null, 2));

// ---------------- preview html ----------------
const svg = (viewBox, letters, width, fill) =>
  `<svg viewBox="${viewBox}" width="${width}" fill="${fill}">` +
  letters.map((lg, gi) =>
    `<g>${(Array.isArray(lg) ? lg : [lg]).map((p) => `<path d="${p}"></path>`).join('')}</g>`
  ).join('') + '</svg>';

const html = `<!doctype html><meta charset="utf-8"><style>
body{background:#101010;color:#ddd;font:13px/1.5 system-ui;margin:24px}
svg{background:#1d1d1d;display:block;margin:6px 0 26px}
svg.light{background:#f4f4f2}
h3{margin:22px 0 4px;font-weight:600}
code{color:#9ad}
</style>
<h3>original: <code>mind</code> (viewBox 333x100)</h3>${svg('0 0 333 100', mindArr, 999, '#fff')}
<h3>NEW: <code>HIM</code> crossbar=B rect (viewBox 333x100)</h3>${svg('0 0 333 100', himLetters, 999, '#fff')}
<h3>NEW: <code>HIM</code> crossbar=B rect on light bg</h3>${svg('0 0 333 100', himLetters, 999, '#111').replace('<svg', '<svg class="light"')}
<h3>ALT: <code>HIM</code> crossbar=A rounded caps on light bg</h3>${svg('0 0 333 100', [bar1, bar2, crossA], 999, '#111').replace('<svg', '<svg class="light"')}
<h3>ALT: <code>HIM</code> crossbar=C rect same-winding on light bg</h3>${svg('0 0 333 100', [bar1, bar2, crossFlat], 999, '#111').replace('<svg', '<svg class="light"')}
<h3>forensic: bar1 alone (light)</h3>${svg('-5 -5 40 110', [bar1], 700, '#111').replace('<svg', '<svg class="light"')}
<h3>forensic: crossB alone (light)</h3>${svg('-5 -5 110 110', [crossB], 700, '#111').replace('<svg', '<svg class="light"')}
<h3>forensic: bar1+crossB (light)</h3>${svg('-5 -5 110 110', [bar1, crossB], 700, '#111').replace('<svg', '<svg class="light"')}
<h3>forensic: bar1+crossB LEFT JUNCTION zoom (light)</h3>${svg('-8 28 45 44', [bar1, crossB], 999, '#111').replace('<svg', '<svg class="light"')}
<h3>forensic: bar2+crossB RIGHT JUNCTION zoom (light)</h3>${svg('-52 28 60 44', [bar2, crossB], 999, '#111').replace('<svg', '<svg class="light"')}
<h3>final candidate zoom (dark bg): LEFT junction</h3>${svg('-8 28 45 44', himLetters, 999, '#fff')}
<h3>original glyph <code>m</code> (translated into M slot)</h3>${svg('130 -3 130 106', [M], 520, '#fff')}
`;
fs.writeFileSync(path.join(here, 'marks-preview.html'), html);

console.log('mind letters:', mindArr.map((l) => (Array.isArray(l) ? l.length : 1)).join(','));
console.log('robotics letters:', robArr.length, 'entries');
console.log('HIM letters written:', himLetters.map((l) => l.length).join(','));
console.log('files: tools/marks-extracted.json, tools/marks-him.json, tools/marks-preview.html');
