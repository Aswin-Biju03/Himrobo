// Inspect GLB models: layout, materials (name + baseColorFactor + texture refs), images, teal detection.
// usage: node tools/inspect-glb.mjs [dir]
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'public/models';

// linear-sRGB helper for reporting an sRGB hex of a linear factor
const lin2srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hex = (c) => Math.round(lin2srgb(c) * 255).toString(16).padStart(2, '0');

for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const file = path.join(dir, name);
  const buf = fs.readFileSync(file);
  const magic = buf.toString('ascii', 0, 4);
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let binLen = 0;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.toString('ascii', off + 4, off + 8).replace(/\0/g, '');
    if (type === 'JSON') json = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    if (type === 'BIN') binLen = len;
    off += 8 + len;
  }
  console.log(`\n=== ${name} (${Math.round(buf.length / 1024)}kb, glTF v${version}, magic ${magic}, total ${total} === BIN ${Math.round(binLen / 1024)}kb`);
  console.log(`  asset: ${JSON.stringify(json.asset && json.asset.generator)}  scenes:${(json.scenes || []).length}  nodes:${(json.nodes || []).length}  meshes:${(json.meshes || []).length}  materials:${(json.materials || []).length}  textures:${(json.textures || []).length}  images:${(json.images || []).length}  skins:${(json.skins || []).length}  anims:${(json.animations || []).length}`);
  (json.images || []).forEach((im, i) => console.log(`  image[${i}]: ${im.mimeType || '?'}  bufferView ${im.bufferView !== undefined ? im.bufferView : 'uri'} ${im.uri ? im.uri : ''}`));
  const matNames = (json.materials || []).map((m) => m.name || '(unnamed)');
  const tealish = [];
  (json.materials || []).forEach((m, i) => {
    const f = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor;
    const tex = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture;
    let tag = '';
    if (f) {
      const [r, g, b] = f;
      tag = `rgb(#${hex(r)}${hex(g)}${hex(b)})${tex ? ` +tex[${tex.index}]` : ''}`;
      // teal-ish: green/blue > red, roughly matching #299093 family
      if (g > r * 3 && b > r * 3 && g > 0.1) tealish.push(`${m.name || i}  factor=#${hex(r)}${hex(g)}${hex(b)}  tex=${tex ? tex.index : 'none'}`);
      if (/29[0-9a-f]{4}|teal/i.test(m.name || '')) tealish.push(`${m.name || i}  factor=#${hex(r)}${hex(g)}${hex(b)}  tex=${tex ? tex.index : 'none'}  (name hit)`);
    } else {
      tag = '(no pbr factor)';
      if (/teal|29[0-9a-f]{4}/i.test(m.name || '')) tealish.push(`${m.name || i}  (name hit, no factor)`);
    }
    if (i < 12) console.log(`  mat[${i}] "${m.name || ''}"  ${tag}`);
  });
  if (matNames.length > 12) console.log(`  ... +${matNames.length - 12} more materials`);
  console.log('  TEAL-ish materials:');
  if (tealish.length === 0) console.log('    (none)');
  tealish.slice(0, 12).forEach((t) => console.log('    ' + t));
  if (tealish.length > 12) console.log(`    ... +${tealish.length - 12} more`);
  // which meshes use teal materials?
  const tealIdx = new Set();
  (json.materials || []).forEach((m, i) => { if (/teal|29[0-9a-f]{4}/i.test(m.name || '')) tealIdx.add(i); });
  const users = [];
  (json.meshes || []).forEach((mesh, mi) => {
    (mesh.primitives || []).forEach((p) => { if (tealIdx.has(p.material)) users.push(`mesh[${mi}] "${mesh.name || ''}"`); });
  });
  if (users.length) console.log('  meshes using teal-named materials: ' + [...new Set(users)].slice(0, 10).join(', '));
}
