// Count monogram dot vs H-crossbar path occurrences in the rebranded content pages.
import fs from 'node:fs';

const DIR = 'content/';
const FILES = ['index.html', 'privacy.html', 'terms-of-use.html', '404.html'];
const DOT = 'M27.2 20.485';
const BAR = 'M0 38.4h80V25.6H0Z';

let bad = 0;
for (const f of FILES) {
  const t = fs.readFileSync(DIR + f, 'utf8');
  const dot = t.split(DOT).length - 1;
  const bar = t.split(BAR).length - 1;
  const ok = dot === 0 && bar > 0;
  if (!ok) bad++;
  console.log(`${f.padEnd(18)} dot: ${dot}   crossbar: ${bar}   ${ok ? 'OK' : 'CHECK!'}`);
}
console.log(bad ? `FAIL: ${bad} file(s) need attention` : 'ALL OK: monogram dot fully replaced by H crossbar');

const fav = fs.readFileSync('public/favicon.svg', 'utf8');
console.log('\npublic/favicon.svg head:', JSON.stringify(fav.slice(0, 120)));
console.log('favicon is real SVG:', fav.trimStart().startsWith('<svg') ? 'YES' : 'NO');
