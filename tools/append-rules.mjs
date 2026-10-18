// Append the H-bar conversion rules to rebrand.config.json (idempotent, text-level insert).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = path.join(here, 'rebrand.config.json');

const rules = [
  { from: 'w-[32%] rounded-full bg-white mt-[9.6%] aspect-square self-start z-above-content', to: 'w-[32%] rounded-full bg-white mt-[14.4%] aspect-[5/2] -mx-[2%] w-[40%] rounded-none self-start z-above-content', note: 'hero mark: ball -> H crossbar, full rendered class (must run BEFORE the fragment rule below)' },
  { from: 'mt-[9.6%] aspect-square self-start', to: 'mt-[14.4%] aspect-[5/2] -mx-[2%] w-[40%] rounded-none self-start', note: 'hero mark: ball fragment inside the chunk component (after the full-class rule above)' },
  { from: 'mt-[9.6%] aspect-square w-[32%] cursor-pointer items-center self-start overflow-clip rounded-full bg-white', to: 'mt-0 aspect-[5/2] w-[40%] -mx-[2%] cursor-pointer items-center self-start overflow-clip rounded-none bg-white', note: 'video mark: pong ball button -> H crossbar (html + chunk)' },
  { from: '[["-22%","-6%"],["40%","0%"],["0%","10%"]]', to: '[["-22%","-6%"],["0%","80%"],["-22%","-6%"]]', note: 'hero mark keyframes: align both stems, crossbar at 40-60% of stem height' },
  { from: '[["20%","0%"],["50%","0%"],["40%","0%"]]', to: '[["20%","0%"],["300%","200%"],["20%","0%"]]', note: 'video mark keyframes: align both stems, crossbar at 40-60% of stem height' },
  { from: 'z-above-content" style="transform:translateY(40%)"', to: 'z-above-content" style="transform:translateY(0%)"', note: 'hero crossbar initial inline style (p=0)' },
  { from: 'z-behind-content" style="transform:none"', to: 'z-behind-content" style="transform:translateY(-22%)"', note: 'hero right stem initial inline style (p=0, aligned with left stem)' },
  { from: 'style="transform:translateY(50%)"', to: 'style="transform:translateY(300%)"', note: 'video crossbar initial inline style (p=0)' },
  { from: 'aria-hidden="true" style="transform:translateY(40%)"', to: 'aria-hidden="true" style="transform:translateY(20%)"', note: 'video right stem initial inline style (p=0, aligned with left stem)' },
];

const raw = fs.readFileSync(cfgPath, 'utf8');
const cfg = JSON.parse(raw);
const existing = new Set(cfg.replacements.map((r) => r.from));
const add = rules.filter((r) => !existing.has(r.from));
if (!add.length) {
  console.log('all H-bar rules already present');
  process.exit(0);
}
const marker = '\n  ],\n  "targets"';
if (!raw.includes(marker)) { console.error('config marker not found'); process.exit(1); }
const block = add.map((r) => ',\n\n    { "from": ' + JSON.stringify(r.from) + ', "to": ' + JSON.stringify(r.to) + ', "note": ' + JSON.stringify(r.note) + ' }').join('');
fs.writeFileSync(cfgPath, raw.replace(marker, block + marker));
console.log('added', add.length, 'rule(s)');
