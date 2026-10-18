// Append the giant-mark dot rules (H crossbar -> centre dot) to rebrand.config.json (idempotent, text-level insert).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = path.join(here, 'rebrand.config.json');

const rules = [
  { from: 'w-[32%] rounded-full bg-white mt-[14.4%] aspect-[5/2] -mx-[2%] w-[40%] rounded-none self-start z-above-content', to: 'w-[32%] rounded-full bg-white mt-[6.4%] aspect-square self-start z-above-content', note: 'hero mark: H crossbar -> centre dot, full rendered class (must run BEFORE the fragment rule below)' },
  { from: 'mt-[14.4%] aspect-[5/2] -mx-[2%] w-[40%] rounded-none self-start', to: 'mt-[6.4%] aspect-square self-start', note: 'hero mark: crossbar fragment -> dot fragment inside the chunk component (after the full-class rule above)' },
  { from: 'mt-0 aspect-[5/2] w-[40%] -mx-[2%] cursor-pointer items-center self-start overflow-clip rounded-none bg-white', to: 'mt-[24%] aspect-square w-[32%] cursor-pointer items-center self-start overflow-clip rounded-full bg-white', note: 'video mark: pong H crossbar -> centre dot (html + chunk)' },
  { from: '[["-22%","-6%"],["0%","80%"],["-22%","-6%"]]', to: '[["-22%","-6%"],["0%","40%"],["-22%","-6%"]]', note: 'hero mark keyframes: dot stays centre (50%) of the aligned stems at all progress' },
  { from: '[["20%","0%"],["300%","200%"],["20%","0%"]]', to: '[["20%","0%"],["50%","0%"],["20%","0%"]]', note: 'video mark keyframes: dot stays centre (50%) of the aligned stems at all progress' },
  { from: 'style="transform:translateY(300%)"', to: 'style="transform:translateY(50%)"', note: 'video dot initial inline style (p=0) - hero dot stays translateY(0%)' },
];

const raw = fs.readFileSync(cfgPath, 'utf8');
const cfg = JSON.parse(raw);
const existing = new Set(cfg.replacements.map((r) => r.from));
const add = rules.filter((r) => !existing.has(r.from));
if (!add.length) {
  console.log('all dot rules already present');
  process.exit(0);
}
const marker = '\n  ],\n  "targets"';
if (!raw.includes(marker)) { console.error('config marker not found'); process.exit(1); }
const block = add.map((r) => ',\n\n    { "from": ' + JSON.stringify(r.from) + ', "to": ' + JSON.stringify(r.to) + ', "note": ' + JSON.stringify(r.note) + ' }').join('');
fs.writeFileSync(cfgPath, raw.replace(marker, block + marker));
console.log('added', add.length, 'rule(s)');
