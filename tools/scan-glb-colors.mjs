// Scan GLB COLOR_0 vertex-color buffers: dominant exact colors + teal-ish candidates with locations.
// usage: node tools/scan-glb-colors.mjs [dir]
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'public/models';
const CT = { 5120: ['int8', 1], 5121: ['uint8', 1], 5122: ['int16', 2], 5123: ['uint16', 2], 5125: ['uint32', 4], 5126: ['float32', 4] };
const lin2srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function parseGLB(file) {
  const buf = fs.readFileSync(file);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.toString('ascii', off + 4, off + 8).replace(/\0/g, '');
    if (type === 'JSON') json = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    if (type === 'BIN') bin = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  return { buf, json, bin };
}

for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const file = path.join(dir, name);
  const { json, bin } = parseGLB(file);
  const hist = new Map(); // key -> { n, acc:Set, where:'material-color|vertex' }
  const addHist = (key, src) => {
    if (!hist.has(key)) hist.set(key, { n: 0, src: new Set(), acc: new Set() });
    const h = hist.get(key);
    h.n++;
    h.src.add(src);
  };
  // material factors as sRGB hex (informational)
  (json.materials || []).forEach((m, mi) => {
    const f = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor;
    if (f) {
      const hx = `#${Math.round(lin2srgb(f[0]) * 255).toString(16).padStart(2, '0')}${Math.round(lin2srgb(f[1]) * 255).toString(16).padStart(2, '0')}${Math.round(lin2srgb(f[2]) * 255).toString(16).padStart(2, '0')}`;
      addHist(hx, 'material');
    }
  });
  // vertex colors
  (json.meshes || []).forEach((mesh, mi) => {
    (mesh.primitives || []).forEach((p) => {
      const ai = p.attributes && p.attributes.COLOR_0;
      if (ai === undefined) return;
      const acc = json.accessors[ai];
      const [fmt, size] = CT[acc.componentType] || ['?', 0];
      const nComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
      const bv = json.bufferViews[acc.bufferView];
      const stride = bv.byteStride || size * nComp;
      const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      const norm = acc.normalized;
      const maxVal = acc.componentType === 5121 ? 255 : acc.componentType === 5123 ? 65535 : 1;
      const read = (o) => (fmt === 'float32' ? bin.readFloatLE(o) : fmt === 'uint8' ? bin.readUInt8(o) : fmt === 'uint16' ? bin.readUInt16LE(o) : bin.readInt8(o));
      for (let v = 0; v < acc.count; v++) {
        const o = base + v * stride;
        const c = [read(o), read(o + size), read(o + size * 2)];
        let srgb;
        if (fmt === 'float32') srgb = c.map(lin2srgb); // glTF vertex colors are linear
        else if (norm) srgb = c.map((x) => x / maxVal); // normalized ints are also linear
        else srgb = c; // fallback: treat as sRGB-ish
        const hx = `#${srgb.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')}`;
        addHist(hx, 'vertex');
        if (!hist.get(hx).acc.has(ai)) hist.get(hx).acc.add(ai);
      }
    });
  });
  const rows = [...hist.entries()].map(([hex, h]) => ({ hex, n: h.n, src: [...h.src].join('+'), acc: [...h.acc].slice(0, 4).join(',') }));
  rows.sort((a, b) => b.n - a.n);
  const tealish = rows.filter((r) => {
    const rr = parseInt(r.hex.slice(1, 3), 16), gg = parseInt(r.hex.slice(3, 5), 16), bb = parseInt(r.hex.slice(5, 7), 16);
    return gg > rr * 1.5 && bb > rr * 1.5 && gg > 60 && Math.abs(gg - bb) < 60;
  });
  console.log(`\n=== ${name} — distinct colors: ${rows.length}, teal-ish: ${tealish.length} ===`);
  console.log('  top colors:');
  rows.slice(0, 8).forEach((r) => console.log(`    ${r.hex}  x${r.n}  [${r.src}]${r.acc ? ' acc:' + r.acc : ''}`));
  if (tealish.length) {
    console.log('  TEAL-ish:');
    tealish.slice(0, 12).forEach((r) => console.log(`    ${r.hex}  x${r.n}  [${r.src}]${r.acc ? ' acc:' + r.acc : ''}`));
  }
}
