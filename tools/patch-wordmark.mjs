// Replace the hero wordmark glyphs: "mind" -> "HIM" (H composed, I + M re-positioned originals).
//
// Two coordinated edits, so SSR markup and client runtime stay byte-identical:
//   1. vendor chunk: the `p.mind.letters` array (drives runtime rendering)
//   2. content/index.html: the SSR <svg viewBox="0 0 333 100"> letter groups,
//      and the robotics svg's --index-start (4 -> 3, = mind letter count)
//
// Reads tools/marks-him.json (produced by tools/extract-marks.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const CHUNK = path.join(ROOT, 'vendor/_next/static/chunks/2tvcy0m4g8gry.js');
const INDEX = path.join(ROOT, 'content/index.html');
const BACKUP = path.join(here, '_wordmark-backup');

const him = JSON.parse(fs.readFileSync(path.join(here, 'marks-him.json'), 'utf8'));
const letters = him.letters; // [[H subpaths...], [I], [M]]

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

// ---------- 1. chunk: swap p.mind.letters ----------
let chunk = fs.readFileSync(CHUNK, 'utf8');
const marker = 'mind:{viewBox:"0 0 333 ".concat(100),letters:';
const at = chunk.indexOf(marker);
if (at < 0) throw new Error('mind marker not found — chunk already patched?');
const arrStart = chunk.indexOf('[', at + marker.length - 1);
const arrText = extractArray(chunk, arrStart);
const current = JSON.parse(arrText);
if (current.length !== 4) throw new Error(`expected 4 original mind letters, found ${current.length}`);

const newArr = JSON.stringify(letters);
chunk = chunk.slice(0, arrStart) + newArr + chunk.slice(arrStart + arrText.length);
if (!chunk.includes('robotics:{viewBox:"0 0 679 ')) throw new Error('robotics marks disappeared — aborting');

// re-verify parse of the patched region
const at2 = chunk.indexOf(marker);
const reparsed = JSON.parse(extractArray(chunk, chunk.indexOf('[', at2 + marker.length - 1)));
if (JSON.stringify(reparsed) !== newArr) throw new Error('chunk re-parse mismatch');

// ---------- 2. markup: rebuild the wordmark svg ----------
const html = fs.readFileSync(INDEX, 'utf8');
const vb = html.indexOf('viewBox="0 0 333 100"');
if (vb < 0) throw new Error('viewBox 333 not found in index.html — already patched?');
const svgStart = html.lastIndexOf('<svg', vb);
const openEnd = html.indexOf('>', vb) + 1;
const openTag = html.slice(svgStart, openEnd);
const svgEnd = html.indexOf('</svg>', svgStart);
if (openTag.includes('style=')) throw new Error('unexpected style attr on wordmark svg');

const group = (i, subpaths) =>
  `<g style="--index:${i}"><path d="${subpaths.join(' ')}" fill="currentcolor"></path>` +
  subpaths.map((d) => `<path d="${d}" pathLength="1"></path>`).join('') +
  `</g>`;
const newSvg = openTag + letters.map((subpaths, i) => group(i, subpaths)).join('') + '</svg>';

let out = html.slice(0, svgStart) + newSvg + html.slice(svgEnd + '</svg>'.length);

const isStart = 'style="--index-start:4"';
if (out.split(isStart).length - 1 !== 1) throw new Error('expected exactly one --index-start:4');
out = out.replace(isStart, 'style="--index-start:3"');

// ---------- backups + write ----------
fs.mkdirSync(BACKUP, { recursive: true });
fs.writeFileSync(path.join(BACKUP, path.basename(CHUNK)), fs.readFileSync(CHUNK));
fs.writeFileSync(path.join(BACKUP, 'index.html'), fs.readFileSync(INDEX));

fs.writeFileSync(CHUNK, chunk);
fs.writeFileSync(INDEX, out);

// ---------- report ----------
const count = (s, sub) => s.split(sub).length - 1;
console.log('chunk patched:', CHUNK.replace(ROOT + path.sep, ''));
console.log('  mind letters:', reparsed.map((l) => l.length).join(','), ' (H=3 subpaths, I=1, M=1)');
console.log('markup patched:', INDEX.replace(ROOT + path.sep, ''));
console.log('  groups in new svg:', count(newSvg, '<g style='));
console.log('  --index-start:3 :', count(out, 'style="--index-start:3"'));
console.log('  --index-start:4 :', count(out, 'style="--index-start:4"'));
console.log('  old m glyph in svg region:', count(newSvg, 'm20.6 44.028'));
console.log('backups in:', BACKUP.replace(ROOT + path.sep, ''));
