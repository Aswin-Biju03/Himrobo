// Recolor hero robot materials in the GLB models (dry-run by default; --apply to write).
//
// Two mechanisms exist in the app (both verified empirically):
//   * hero models (arm/hand): the toon material resolver uses material.color, and
//     displayed_sRGB_byte = round(255 * baseColorFactor)  (the double conversion cancels).
//     e.g. stored [0.1607, 0.5647, 0.5764] displays as #299093 (the old teal).
//   * service models (pick-and-place/sorting/fastening/connectors): the resolver reads the
//     hex straight out of the material NAME ("teal #299093") -> displays exactly that hex.
//     Renaming the hex (same 7 chars) is byte-safe and needs no other change.
//
// arm.glb + hand.glb: material "blue" factor -> [224/255, 92/255, 0] -> displays #e05c00 (accent).
// service GLBs: "#299093" / earlier "#ff6600" strings -> "#e05c00" (material + node names).
//
// GLB is rebuilt properly: JSON chunk re-serialized + space-padded to 4 bytes, BIN chunk kept
// byte-identical, all chunk lengths + the file header updated.
//
// usage: node tools/recolor-glb.mjs [--apply]
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const root = path.join(here, '..');
const backupDir = path.join(here, '_models-backup');

const TARGETS = {
  'arm.glb': { factors: [{ name: 'blue', factor: [224 / 255, 92 / 255, 0, 1], note: 'displays #e05c00 (accent)' }] },
  'hand.glb': { factors: [{ name: 'blue', factor: [224 / 255, 92 / 255, 0, 1], note: 'displays #e05c00 (accent)' }] },
  'connectors.glb': { strings: [['#ff6600', '#e05c00'], ['#299093', '#e05c00']] },
  'fastening.glb': { strings: [['#ff6600', '#e05c00'], ['#299093', '#e05c00']] },
  'pick-and-place.glb': { strings: [['#ff6600', '#e05c00'], ['#299093', '#e05c00']] },
  'sorting.glb': { strings: [['#ff6600', '#e05c00'], ['#299093', '#e05c00']] },
};

function parseGLB(buf) {
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let jsonChunkLen = 0;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.toString('ascii', off + 4, off + 8).replace(/\0/g, '');
    if (type === 'JSON') {
      jsonChunkLen = len;
      json = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    }
    if (type === 'BIN') bin = Buffer.from(buf.subarray(off + 8, off + 8 + len));
    off += 8 + len;
  }
  return { version, total, json, jsonChunkLen, bin };
}

function buildGLB(version, json, bin) {
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const pad = (4 - (jsonBuf.length % 4)) % 4;
  if (pad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
  const total = 12 + 8 + jsonBuf.length + (bin ? 8 + bin.length : 0);
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 'ascii');
  out.writeUInt32LE(version, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.write('JSON', 16, 'ascii');
  jsonBuf.copy(out, 20);
  let off = 20 + jsonBuf.length;
  if (bin) {
    out.writeUInt32LE(bin.length, off);
    out.write('BIN\0', off + 4, 'ascii');
    bin.copy(out, off + 8);
  }
  return out;
}

const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

// replace every occurrence of `from` in every string value of the JSON tree; returns count
function replaceStrings(node, from, to) {
  let n = 0;
  if (typeof node === 'string') return 0; // handled by the caller on each string slot
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string' && node[i].includes(from)) {
        n += node[i].split(from).length - 1;
        node[i] = node[i].split(from).join(to);
      } else n += replaceStrings(node[i], from, to);
    }
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (typeof node[k] === 'string' && node[k].includes(from)) {
        n += node[k].split(from).length - 1;
        node[k] = node[k].split(from).join(to);
      } else n += replaceStrings(node[k], from, to);
    }
  }
  return n;
}

let changes = 0;
for (const [file, targets] of Object.entries(TARGETS)) {
  const full = path.join(root, 'public', 'models', file);
  const buf = fs.readFileSync(full);
  const { version, json, bin } = parseGLB(buf);
  const before = Buffer.from(buf);
  console.log(`\n=== ${file} (${Math.round(buf.length / 1024)}kb, BIN ${Math.round(bin.length / 1024)}kb) ===`);
  let dirty = false;
  for (const t of targets.factors || []) {
    const mat = (json.materials || []).find((m) => m.name === t.name);
    if (!mat) {
      console.log(`  material "${t.name}": NOT FOUND`);
      continue;
    }
    const f = mat.pbrMetallicRoughness.baseColorFactor;
    const shownBefore = `rgb(${f.slice(0, 3).map((v) => Math.round(v * 255)).join(',')})`;
    console.log(`  material "${t.name}": factor ${JSON.stringify(f)} -> ${shownBefore}  =>  ${JSON.stringify(t.factor)} -> rgb(${t.factor.slice(0, 3).map((v) => Math.round(v * 255)).join(',')})  [${t.note}]`);
    if (same(f, t.factor)) {
      console.log('    already applied, skipping');
      continue;
    }
    mat.pbrMetallicRoughness.baseColorFactor = t.factor;
    dirty = true;
    changes++;
  }
  for (const [from, to] of targets.strings || []) {
    const n = replaceStrings(json, from, to);
    console.log(`  strings "${from}" -> "${to}": ${n} occurrence(s) in names`);
    if (n > 0) {
      dirty = true;
      changes += n;
    }
  }
  if (!dirty) continue;
  if (!APPLY) {
    console.log('  DRY (run with --apply to write)');
    continue;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, file);
  const madeBackup = !fs.existsSync(backup);
  if (madeBackup) fs.writeFileSync(backup, before);
  const out = buildGLB(version, json, bin);
  fs.writeFileSync(full, out);
  console.log(`  written: ${before.length}b -> ${out.length}b  (backup ${madeBackup ? 'created' : 'exists'} in tools/_models-backup)${madeBackup ? '' : ' — ' + backup}`);
  // self-check: reparse + confirm no old string remains anywhere in the JSON
  const reBuf = fs.readFileSync(full);
  const re = parseGLB(reBuf);
  const leftover = (targets.strings || []).filter(([from]) => reBuf.toString('utf8').includes(from)).length;
  const ok = re.json && re.bin.length === bin.length && leftover === 0 && file === path.basename(full);
  console.log(`  verify: reparse ${ok ? 'PASS' : 'FAIL'} (json parses, bin identical, no "${(targets.strings?.[0] || [])[0] || ''}" left)`);
}

console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${changes} change(s) ${APPLY ? 'applied' : 'would apply'}.`);
