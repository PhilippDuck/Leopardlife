#!/usr/bin/env node
/*
 * Wandelt ein mit Meshy erzeugtes Low-Poly-Modell (GLB mit eingebetteter PNG-Textur) in ein kleines JS-Modul für das Spiel um.
 *
 *   node tools/meshy-model.cjs <modell.glb> <src/ziel.js> --name ACACIA --height 6 [--perch 0.7] [--colors]
 *
 * --colors: alles ein Teil (wood), statt Helligkeit die echte Farbe je Dreieck (rgb) – für Felsen, Termitenhügel, Blüten …
 *
 * --perch: Liegeplatz auf diesem Anteil der Höhe über der Stammmitte (z. B. oben auf dem dicken Affenbrotbaum-Stamm
 *          oder in der Astgabel). Ohne --perch liegt er oben auf dem Laub in der Kronenmitte.
 * Das Werkzeug gibt außerdem den Stammradius je Höhenstufe aus, damit man --perch passend wählen kann.
 *
 * - Die Textur wird je Dreieck gemittelt: flache Farbflächen brauchen keine Textur, nur eine Helligkeit je Dreieck.
 *   Den Farbton gibt das Spiel je Baum vor (Instanzfarbe), damit jeder Baum etwas anders aussieht.
 * - Dreiecke werden nach Farbe in Holz und Laub getrennt (grün und kräftig = Laub), damit das Laub im Wind schwingen kann.
 * - Das Modell wird auf die gewünschte Höhe skaliert, der Stammfuß steht im Ursprung auf y=0.
 * - Ausgabe: Positionen (Millimeter, Int16), Indizes (Uint16) und Helligkeit (Uint8) als Base64, dazu Eckdaten
 *   (Stammradius, Kronenmitte, Liegeplatz in der Krone).
 */
const fs = require('fs');
const zlib = require('zlib');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
const [src, out] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
if (!src || !out) { console.error('Aufruf: node tools/meshy-model.cjs <modell.glb> <ziel.js> --name NAME --height METER'); process.exit(1); }
const NAME = arg('name', 'MODEL'), HEIGHT = +arg('height', 6), PERCH = arg('perch') === undefined ? null : +arg('perch');
// --colors: ein Teil mit echter Farbe je Dreieck (für Felsen, Termitenhügel, Aloe …), kein Laub
const COLORS = process.argv.includes('--colors');

/* ---------- GLB lesen ---------- */
const glb = fs.readFileSync(src);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('keine GLB-Datei');
const jsonLen = glb.readUInt32LE(12), gltf = JSON.parse(glb.slice(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
function view(i) { const v = gltf.bufferViews[i]; return glb.slice(binStart + (v.byteOffset || 0), binStart + (v.byteOffset || 0) + v.byteLength); }
function accessor(i) {
  const a = gltf.accessors[i], b = view(a.bufferView), off = a.byteOffset || 0;
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], out = new Float64Array(a.count * n);
  const rd = { 5126: (o) => b.readFloatLE(o), 5125: (o) => b.readUInt32LE(o), 5123: (o) => b.readUInt16LE(o) }[a.componentType];
  const size = { 5126: 4, 5125: 4, 5123: 2 }[a.componentType];
  for (let k = 0; k < a.count * n; k++) out[k] = rd(off + k * size);
  return out;
}
if (gltf.meshes.length !== 1 || gltf.meshes[0].primitives.length !== 1) throw new Error('erwartet genau ein Modellteil');
const prim = gltf.meshes[0].primitives[0];
const pos = accessor(prim.attributes.POSITION), uv = accessor(prim.attributes.TEXCOORD_0), idx = accessor(prim.indices);
const node = gltf.nodes.find((n) => n.mesh === 0) || {};
if (node.matrix || node.rotation || node.scale) console.warn('Hinweis: Knoten-Transformation wird nicht angewendet');

/* ---------- PNG lesen (8 Bit, RGB/RGBA, ohne Zeilensprung) ---------- */
function decodePng(buf) {
  let p = 8, w, h, type, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), data = buf.slice(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12]) throw new Error('PNG-Format nicht unterstützt'); }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const bpp = { 2: 3, 6: 4 }[type]; if (!bpp) throw new Error('PNG-Farbtyp nicht unterstützt: ' + type);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, d = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[d + x - bpp] : 0, b = y ? px[d - stride + x] : 0, c = x >= bpp && y ? px[d - stride + x - bpp] : 0;
      let v = raw[s + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[d + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
const mat = gltf.materials[prim.material], texIndex = mat.pbrMetallicRoughness.baseColorTexture.index;
const tex = decodePng(view(gltf.images[gltf.textures[texIndex].source].bufferView));
const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function sample(u, v) {
  const x = Math.min(tex.w - 1, Math.max(0, Math.floor(u * tex.w))), y = Math.min(tex.h - 1, Math.max(0, Math.floor(v * tex.h)));
  const o = (y * tex.w + x) * tex.bpp; return [tex.px[o], tex.px[o + 1], tex.px[o + 2]];
}

/* ---------- Farbe je Dreieck, Holz oder Laub ---------- */
const tris = idx.length / 3, triCol = [], triLeaf = [];
const W = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
for (let t = 0; t < tris; t++) {
  const c = [0, 0, 0];
  for (const w of W) {
    let u = 0, v = 0;
    for (let k = 0; k < 3; k++) { const i = idx[t * 3 + k]; u += uv[i * 2] * w[k]; v += uv[i * 2 + 1] * w[k]; }
    const s = sample(u, v); c[0] += s[0] / W.length; c[1] += s[1] / W.length; c[2] += s[2] / W.length;
  }
  const mx = Math.max(...c), mn = Math.min(...c), sat = mx ? (mx - mn) / mx : 0;
  triCol.push(c); triLeaf.push(!COLORS && sat > 0.3 && c[1] >= c[0] * 0.8 && c[1] > c[2] * 1.2);
}
// Einzelne Ausreißer: Ein Dreieck, dessen Nachbarn (gemeinsame Ecke) überwiegend anders sind, wird angeglichen
const byVert = new Map();
for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) { const key = [0, 1, 2].map((a) => pos[idx[t * 3 + k] * 3 + a].toFixed(4)).join(); (byVert.get(key) || byVert.set(key, []).get(key)).push(t); }
const neighbours = Array.from({ length: tris }, () => new Set());
for (const list of byVert.values()) for (const a of list) for (const b of list) if (a !== b) neighbours[a].add(b);
for (let pass = 0; pass < 2; pass++) {
  const next = triLeaf.slice();
  for (let t = 0; t < tris; t++) { const n = [...neighbours[t]]; if (n.length < 3) continue; const same = n.filter((o) => triLeaf[o] === triLeaf[t]).length; if (same / n.length < 0.25) next[t] = !triLeaf[t]; }
  triLeaf.splice(0, tris, ...next);
}
// Kleine Laubinseln (z. B. grüne Streifen auf Ästen) gehören zum Holz: zusammenhängende Laubstücke unter MIN_LEAF Dreiecken umfärben
const MIN_LEAF = 12, seen = new Uint8Array(tris);
for (let t = 0; t < tris; t++) {
  if (!triLeaf[t] || seen[t]) continue;
  const group = [t]; seen[t] = 1;
  for (let g = 0; g < group.length; g++) for (const o of neighbours[group[g]]) if (triLeaf[o] && !seen[o]) { seen[o] = 1; group.push(o); }
  if (group.length < MIN_LEAF) for (const o of group) triLeaf[o] = false;
}

/* ---------- Ausrichten: Stammfuß auf y=0 im Ursprung, Höhe in Metern ---------- */
let minY = Infinity, maxY = -Infinity;
for (let i = 0; i < pos.length; i += 3) { minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]); }
const scale = HEIGHT / (maxY - minY);
const footY = minY + (maxY - minY) * 0.06;
let fx = 0, fz = 0, fn = 0;
for (let t = 0; t < tris; t++) if (!triLeaf[t]) for (let k = 0; k < 3; k++) { const i = idx[t * 3 + k]; if (pos[i * 3 + 1] < footY) { fx += pos[i * 3]; fz += pos[i * 3 + 2]; fn++; } }
fx /= fn || 1; fz /= fn || 1;
const P = (i) => [(pos[i * 3] - fx) * scale, (pos[i * 3 + 1] - minY) * scale, (pos[i * 3 + 2] - fz) * scale];

/* ---------- Teile bauen ---------- */
function part(leaf) {
  const map = new Map(), verts = [], index = [], shade = [];
  const list = []; for (let t = 0; t < tris; t++) if (triLeaf[t] === leaf) list.push(t);
  const lum = (c) => 0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);
  const mean = list.reduce((s, t) => s + lum(triCol[t]), 0) / (list.length || 1), meanCol = [0, 1, 2].map((a) => list.reduce((s, t) => s + triCol[t][a], 0) / (list.length || 1));
  for (const t of list) {
    for (let k = 0; k < 3; k++) { const i = idx[t * 3 + k]; if (!map.has(i)) { map.set(i, verts.length / 3); verts.push(...P(i)); } index.push(map.get(i)); }
    shade.push(Math.round(Math.min(2, Math.max(0.3, Math.sqrt(lum(triCol[t]) / mean))) * 100));   // Helligkeit relativ zum Mittel, 100 = 1.0
  }
  const rgb = []; for (const t of list) rgb.push(...triCol[t].map((v) => Math.round(Math.min(255, v))));
  return { verts, index, shade, rgb, tris: list.length, color: meanCol.map(Math.round) };
}
const wood = part(false), leaf = part(true);
if (wood.verts.length / 3 > 65535 || leaf.verts.length / 3 > 65535) throw new Error('zu viele Ecken für Uint16');

/* ---------- Eckdaten ---------- */
// Stammradius in Hüfthöhe (über dem verbreiterten Fuß): mittlerer Abstand der Ecken zur Stammmitte
let tx = 0, tz = 0, tn = 0, trunkR = 0;
const atHip = (i) => wood.verts[i + 1] > HEIGHT * 0.08 && wood.verts[i + 1] < HEIGHT * 0.2;
for (let i = 0; i < wood.verts.length; i += 3) if (atHip(i)) { tx += wood.verts[i]; tz += wood.verts[i + 2]; tn++; }
tx /= tn || 1; tz /= tn || 1;
for (let i = 0; i < wood.verts.length; i += 3) if (atHip(i)) trunkR += Math.hypot(wood.verts[i] - tx, wood.verts[i + 2] - tz) / tn;
// Krone: das Laub, bei Bäumen ohne Laub das Holz über 40 % der Höhe
let cx = 0, cz = 0, cminY = Infinity, cmaxY = -Infinity, rx = 0;
const lv = leaf.tris ? leaf.verts : wood.verts.filter((_, i, a) => a[i - (i % 3) + 1] > HEIGHT * 0.4), ln = lv.length / 3;
for (let i = 0; i < lv.length; i += 3) { cx += lv[i] / ln; cz += lv[i + 2] / ln; cminY = Math.min(cminY, lv[i + 1]); cmaxY = Math.max(cmaxY, lv[i + 1]); }
for (let i = 0; i < lv.length; i += 3) rx = Math.max(rx, Math.hypot(lv[i] - cx, lv[i + 2] - cz));
// Stammradius je Höhenstufe (nur Ecken nahe der Stammachse), zur Wahl von --perch
const band = (lo, hi) => { let x = 0, z = 0, n = 0; for (let i = 0; i < wood.verts.length; i += 3) { const y = wood.verts[i + 1]; if (y >= lo && y < hi) { x += wood.verts[i]; z += wood.verts[i + 2]; n++; } } return n ? [x / n, z / n, n] : null; };
for (let f = 0; f < 1; f += 0.05) {
  const b = band(f * HEIGHT, (f + 0.05) * HEIGHT); if (!b) continue;
  let r = 0, n = 0; for (let i = 0; i < wood.verts.length; i += 3) { const y = wood.verts[i + 1]; if (y >= f * HEIGHT && y < (f + 0.05) * HEIGHT) { r = Math.max(r, Math.hypot(wood.verts[i] - b[0], wood.verts[i + 2] - b[1])); n++; } }
  console.log(`  Höhe ${(f * 100).toFixed(0).padStart(3)} %: Holz-Ausdehnung ${r.toFixed(2)} m (${n} Ecken)`);
}
let perchX = cx, perchY = cminY, perchZ = cz;
if (PERCH !== null) {
  // Liegeplatz auf fester Höhe: Mitte der Holz-Ecken dort, die nahe der Stammachse liegen
  // (Stammachse von unten nach oben verfolgen, damit abstehende Äste die Mitte nicht verschieben)
  perchY = PERCH * HEIGHT; perchX = tx; perchZ = tz;
  for (let y = HEIGHT * 0.15; y <= perchY + 1e-6; y += HEIGHT * 0.05) {
    let x = 0, z = 0, n = 0;
    for (let i = 0; i < wood.verts.length; i += 3) { const vy = wood.verts[i + 1]; if (Math.abs(vy - y) < HEIGHT * 0.04 && Math.hypot(wood.verts[i] - perchX, wood.verts[i + 2] - perchZ) < trunkR * 2 + 0.3) { x += wood.verts[i]; z += wood.verts[i + 2]; n++; } }
    if (n) { perchX = x / n; perchZ = z / n; }
  }
} else {
  // Liegeplatz: höchste Laubfläche in der Nähe der Kronenmitte (dort liegt der Leopard oben auf)
  for (let i = 0; i < lv.length; i += 3) if (Math.hypot(lv[i] - cx, lv[i + 2] - cz) < rx * 0.35) perchY = Math.max(perchY, lv[i + 1]);
}
const r2 = (v) => Math.round(v * 100) / 100;
const info = { height: HEIGHT, trunkR: r2(Math.max(0.15, trunkR)), trunk: [r2(tx), r2(tz)], crown: [r2(cx), r2((cminY + cmaxY) / 2), r2(cz)], crownBottom: r2(cminY), crownTop: r2(cmaxY), rx: r2(rx), ry: r2((cmaxY - cminY) / 2), perch: [r2(perchX), r2(perchY), r2(perchZ)] };

/* ---------- Ausgabe ---------- */
const b64 = (Arr, data) => Buffer.from(new Arr(data).buffer).toString('base64');
const enc = (p) => `{ pos: '${b64(Int16Array, p.verts.map((v) => Math.round(v * 1000)))}', index: '${b64(Uint16Array, p.index)}', ${COLORS ? `rgb: '${b64(Uint8Array, p.rgb)}'` : `shade: '${b64(Uint8Array, p.shade)}'`} }`;
const file = `// Erzeugt mit tools/meshy-model.cjs aus ${require('path').basename(src)} – nicht von Hand ändern.
// Holz: ${wood.tris} Dreiecke, Laub: ${leaf.tris} Dreiecke. Mittlere Farbe im Modell: Holz rgb(${wood.color}), Laub rgb(${leaf.color}).
export const ${NAME} = {
  info: ${JSON.stringify(info)},
  wood: ${enc(wood)},
  leaf: ${leaf.tris ? enc(leaf) : 'null'},
};
`;
fs.writeFileSync(out, file);
console.log(`${out}: Holz ${wood.tris} / Laub ${leaf.tris} Dreiecke, ${(file.length / 1024).toFixed(1)} KB`);
console.log(JSON.stringify(info));
