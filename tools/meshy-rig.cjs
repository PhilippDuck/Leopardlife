#!/usr/bin/env node
/*
 * Wandelt ein geriggtes und animiertes Meshy-Modell (GLB: ein Skin, Clips aus der Animationsbibliothek) in ein JS-Modul um.
 *
 *   node tools/meshy-rig.cjs <modell.glb> <src/ziel.js> --name LEO_ADULT --height 1.15 --clips idle=leopard_idle,walk=…
 *
 * - Geometrie: Positionen (Int16), Knochen-Indizes und Gewichte je Ecke (Uint8), Dreiecke (Uint16).
 * - Je Dreieck eine Fellklasse aus der Textur: 0 Fell, 1 hell (Bauch, Brust, Schnauze), 2 dunkel am Kopf (Nase, Augen).
 *   Dunkle Stellen außerhalb des Kopfs sind Meshys Flecken und zählen als Fell: das Spiel legt eigene Flecken darüber.
 * - Knoten (Name ohne Punkte wie bei three.js, Eltern, Ruhelage), inverse Bindematrizen, Clips mit 15 Bildern je Sekunde (kürzer als 1 s: 30):
 *   Drehungen (Int16-Quaternionen) und, wo sie sich ändern, Verschiebungen (Float32). Skalierung wird nicht animiert.
 * - --repaint-grey: grauweiße Flecken der Textur hinten am Körper mit Fellfarbe übermalen (nicht bei gräulichem Fell, z. B. Jungtier)
 * - Maßstab und Höhe: Das Modell wird so skaliert, dass es in Ruhelage --height hoch ist, die Pfoten stehen auf y=0.
 */
const fs = require('fs');
const zlib = require('zlib');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
const pos0 = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const [src, out] = pos0;
if (!src || !out) { console.error('Aufruf: node tools/meshy-rig.cjs <modell.glb> <ziel.js> --name NAME --height 1.15 --clips name=glbName,…'); process.exit(1); }
const NAME = arg('name', 'RIG'), HEIGHT = +arg('height', 1), FPS = 15, TEX = +arg('tex', 512);
const CLIPS = Object.fromEntries((arg('clips', '') || '').split(',').filter(Boolean).map((s) => s.split('=')));

/* ---------- GLB lesen ---------- */
const glb = fs.readFileSync(src);
const jsonLen = glb.readUInt32LE(12), gltf = JSON.parse(glb.slice(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
function view(i) { const v = gltf.bufferViews[i]; return glb.slice(binStart + (v.byteOffset || 0), binStart + (v.byteOffset || 0) + v.byteLength); }
function accessor(i) {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView], b = view(a.bufferView), off = a.byteOffset || 0;
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType], stride = v.byteStride || n * size;
  const rd = { 5126: (o) => b.readFloatLE(o), 5125: (o) => b.readUInt32LE(o), 5123: (o) => b.readUInt16LE(o), 5121: (o) => b.readUInt8(o) }[a.componentType];
  const norm = a.normalized ? { 5121: 255, 5123: 65535 }[a.componentType] : 1;
  const res = new Float64Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) res[k * n + c] = rd(off + k * stride + c * size) / norm;
  return res;
}
const meshNodeIdx = gltf.nodes.findIndex((n) => n.mesh !== undefined && n.skin !== undefined);
if (meshNodeIdx < 0) throw new Error('kein Modell mit Skin');
const prim = gltf.meshes[gltf.nodes[meshNodeIdx].mesh].primitives[0];
const P = accessor(prim.attributes.POSITION), UV = accessor(prim.attributes.TEXCOORD_0), J = accessor(prim.attributes.JOINTS_0), W = accessor(prim.attributes.WEIGHTS_0), IDX = accessor(prim.indices);
const skin = gltf.skins[gltf.nodes[meshNodeIdx].skin], IBM = accessor(skin.inverseBindMatrices);

/* ---------- Mathe (Spalten-Matrizen wie glTF/three.js) ---------- */
function compose(t, r, s) {
  const [x, y, z, w] = r, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
}
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
const apply = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const trs = (n) => { if (n.matrix) throw new Error('Knoten mit Matrix nicht unterstützt: ' + n.name); return [n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]]; };

/* ---------- Knotenbaum: nur Vorfahren von Knochen und Modell ---------- */
const parent = new Array(gltf.nodes.length).fill(-1);
gltf.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
const need = new Set();
const mark = (i) => { while (i >= 0 && !need.has(i)) { need.add(i); i = parent[i]; } };
skin.joints.forEach(mark); mark(meshNodeIdx);
const order = []; const visit = (i) => { if (!need.has(i)) return; order.push(i); (gltf.nodes[i].children || []).forEach(visit); };
gltf.nodes.forEach((n, i) => { if (parent[i] < 0) visit(i); });
const local = (i) => order.indexOf(i);
const sanitize = (s) => (s || 'node').replace(/\s/g, '_').replace(/[\[\].:\/]/g, '');
const names = new Set();
const nodes = order.map((i) => {
  const n = gltf.nodes[i]; let nm = sanitize(n.name); while (names.has(nm)) nm += '_'; names.add(nm);
  const [t, r, s] = trs(n); return { n: nm, p: parent[i] >= 0 ? local(parent[i]) : -1, t, r, s, src: i };
});
const world = new Map(); for (const i of order) { const [t, r, s] = trs(gltf.nodes[i]); const m = compose(t, r, s); world.set(i, parent[i] >= 0 && world.has(parent[i]) ? mul(world.get(parent[i]), m) : m); }

/* ---------- Ruhelage, Maßstab, Höhe ---------- */
// Ecken in Ruhelage: Skinning mit den Ruhelagen der Knochen (Welt × inverse Bindematrix), wie three.js es zeichnet
const jointM = skin.joints.map((j, k) => mul(world.get(j), Array.from(IBM.slice(k * 16, k * 16 + 16))));
const meshInv = (() => { const m = world.get(meshNodeIdx); return m; })();
const nV = P.length / 3, rest = new Float64Array(nV * 3);
let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let v = 0; v < nV; v++) {
  const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; let x = 0, y = 0, z = 0;
  for (let k = 0; k < 4; k++) { const w = W[v * 4 + k]; if (!w) continue; const q = apply(jointM[J[v * 4 + k]], p); x += q[0] * w; y += q[1] * w; z += q[2] * w; }
  rest.set([x, y, z], v * 3); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
}
const scale = HEIGHT / (maxY - minY);
const headJ = skin.joints.find((j) => /^head$/.test(gltf.nodes[j].name)) ?? skin.joints.find((j) => /head/.test(gltf.nodes[j].name));
const headPos = apply(world.get(headJ), [0, 0, 0]);
console.log(`Ruhelage: Höhe ${(maxY - minY).toFixed(3)}, Länge z ${minZ.toFixed(3)}…${maxZ.toFixed(3)}, Kopf bei z=${headPos[2].toFixed(3)} (${headPos[2] > 0 ? 'vorn = +z' : 'ACHTUNG: Kopf nicht bei +z'}), Maßstab ${scale.toFixed(3)}`);

/* ---------- Fellklasse je Dreieck aus der Textur ---------- */
function decodePng(buf) {
  let p = 8, w, h, type, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), data = buf.slice(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; } else if (kind === 'IDAT') idat.push(data); else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const bpp = { 2: 3, 6: 4 }[type], raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, d = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[d + x - bpp] : 0, b = y ? px[d - stride + x] : 0, c = x >= bpp && y ? px[d - stride + x - bpp] : 0;
      let v = raw[s + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[d + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
const mat = gltf.materials[prim.material], img = gltf.images[gltf.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source];
if (img.mimeType !== 'image/png') throw new Error('Textur ist kein PNG: ' + img.mimeType);
const tex = decodePng(view(img.bufferView));
const sample = (u, v) => { const x = Math.min(tex.w - 1, Math.max(0, Math.floor(u * tex.w))), y = Math.min(tex.h - 1, Math.max(0, Math.floor(v * tex.h))), o = (y * tex.w + x) * tex.bpp; return [tex.px[o], tex.px[o + 1], tex.px[o + 2]]; };
const nT = IDX.length / 3, cls = new Uint8Array(nT), lum = new Float64Array(nT), sat = new Float64Array(nT);
const headSet = new Set(skin.joints.map((j, k) => [j, k]).filter(([j]) => /^(head|jaw|ear\.)/.test(gltf.nodes[j].name)).map(([, k]) => k));
for (let t = 0; t < nT; t++) {
  // Reines Schwarz ist der leere Hintergrund zwischen den Inseln der Textur (kleine Dreiecke am Inselrand treffen ihn): nicht mitzählen
  let c = [0, 0, 0], n = 0;
  for (const w of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45]]) {
    let u = 0, v = 0; for (let k = 0; k < 3; k++) { const i = IDX[t * 3 + k]; u += UV[i * 2] * w[k]; v += UV[i * 2 + 1] * w[k]; }
    const s = sample(u, v); if (s[0] + s[1] + s[2] < 12) continue; c = c.map((x, i) => x + s[i]); n++;
  }
  if (!n) { lum[t] = 0.4; sat[t] = 0.5; continue; }   // nur Hintergrund getroffen: wie Fell
  c = c.map((x) => x / n);
  const mx = Math.max(...c), mn = Math.min(...c); lum[t] = (mx + mn) / 510; sat[t] = mx ? (mx - mn) / mx : 0;
}
const sorted = Array.from(lum).sort((a, b) => a - b), median = sorted[Math.floor(nT / 2)];
let nLight = 0, nDark = 0;
// Nase und Augen liegen vorn am Kopf: Mitte des Dreiecks (Ruhelage) vor dem Kopfknochen
/** Nasenspitze: vorderste 1,5 % der Länge (sicher dunkel, auch wenn die Textur dort nichts Dunkles hat) */
const noseTip = (t) => { let z = 0; for (let k = 0; k < 3; k++) z += rest[IDX[t * 3 + k] * 3 + 2] / 3; return z > maxZ - 0.015 * (maxZ - minZ); };
const frontOfHead = (t) => { let z = 0; for (let k = 0; k < 3; k++) z += rest[IDX[t * 3 + k] * 3 + 2] / 3; return z > headPos[2] + 0.25 * (maxZ - headPos[2]); };
for (let t = 0; t < nT; t++) {
  // Kopf: Knochen mit dem größten Gewicht über die drei Ecken
  const wsum = new Map(); for (let k = 0; k < 3; k++) { const i = IDX[t * 3 + k]; for (let q = 0; q < 4; q++) wsum.set(J[i * 4 + q], (wsum.get(J[i * 4 + q]) || 0) + W[i * 4 + q]); }
  const top = [...wsum.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if (lum[t] > median + 0.17 && sat[t] < 0.45) { cls[t] = 1; nLight++; }
  else if (headSet.has(top) && (lum[t] < 0.12 && frontOfHead(t) || noseTip(t))) { cls[t] = 2; nDark++; }
}
console.log(`Dreiecke: ${nT}, hell ${nLight}, dunkel am Kopf ${nDark}`);

/* ---------- Clips ---------- */
const nodeOf = new Map(order.map((i, k) => [i, k]));
function sampleChannel(sampler, times) {
  const inp = accessor(sampler.input), outp = accessor(sampler.output), n = outp.length / inp.length;
  return times.map((t) => {
    let i = 0; while (i < inp.length - 2 && inp[i + 1] < t) i++;
    const t0 = inp[i], t1 = inp[Math.min(i + 1, inp.length - 1)], f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    const a = Array.from(outp.slice(i * n, i * n + n)), b = Array.from(outp.slice(Math.min(i + 1, inp.length - 1) * n, Math.min(i + 1, inp.length - 1) * n + n));
    if (n === 4) { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (d < 0) b.forEach((x, k) => { b[k] = -x; }); const q = a.map((x, k) => x + (b[k] - x) * f), l = Math.hypot(...q) || 1; return q.map((x) => x / l); }
    return a.map((x, k) => x + (b[k] - x) * f);
  });
}
const b64 = (Arr, data) => Buffer.from(new Arr(data).buffer).toString('base64');
const clips = {};
for (const [key, glbName] of Object.entries(CLIPS)) {
  const anim = gltf.animations.find((a) => a.name === glbName); if (!anim) throw new Error('Clip fehlt: ' + glbName);
  const dur = Math.max(...anim.samplers.map((s) => gltf.accessors[s.input].max[0])), frames = Math.max(2, Math.round(dur * (dur < 1 ? 30 : FPS)) + 1);   // kurze Clips (Rennen, Sprung) feiner
  const times = Array.from({ length: frames }, (_, i) => (i * dur) / (frames - 1));
  const tracks = [];
  for (const ch of anim.channels) {
    const k = nodeOf.get(ch.target.node); if (k === undefined || ch.target.path === 'scale') continue;
    const vals = sampleChannel(anim.samplers[ch.sampler], times), restV = ch.target.path === 'rotation' ? nodes[k].r : nodes[k].t;
    const vary = vals.some((v) => v.some((x, i) => Math.abs(x - restV[i]) > (ch.target.path === 'rotation' ? 2e-3 : 1e-4 / scale)));
    if (!vary) continue;
    if (ch.target.path === 'rotation') tracks.push([k, 'r', b64(Int16Array, vals.flat().map((x) => Math.round(x * 32767)))]);
    else tracks.push([k, 't', b64(Float32Array, vals.flat())]);
  }
  // Schrittlänge: Die Clips laufen auf der Stelle; eine Vorderpfote schwingt je Schrittfolge um etwa eine Schrittlänge vor und zurück.
  // Lage der Pfote je Bild (Vorwärtskinematik), Spanne entlang +z (vorn), in Metern bei Maßstab 1 nach der Normierung.
  const pose = new Map();
  for (const ch of anim.channels) if (ch.target.path !== 'scale') pose.set(ch.target.node + ch.target.path, sampleChannel(anim.samplers[ch.sampler], times));
  const footAt = (foot, P, f) => { let m = null; const chain = []; for (let i = foot; i >= 0; i = parent[i]) chain.unshift(i);
    for (const i of chain) { const [t, r, sc] = trs(gltf.nodes[i]); const T = P.get(i + 'translation'), R = P.get(i + 'rotation'); const l = compose(T ? T[f] : t, R ? R[f] : r, sc); m = m ? mul(m, l) : l; }
    return [m[12], m[13], m[14]]; };
  const foot = gltf.nodes.findIndex((n) => /^frontFoot\.L$/.test(n.name || ''));
  let zmin = Infinity, zmax = -Infinity;
  if (foot >= 0) for (let f = 0; f < frames; f++) { const z = footAt(foot, pose, f)[2]; zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  const stride = foot >= 0 ? zmax - zmin : 0;
  // Tempo des Clips (m/s bei Maßstab 1, nach der Normierung): wie schnell sich der Körper bewegen muss, damit die Pfoten nicht rutschen.
  // Fein abgetastet (60 Bilder/s), Verschiebungen ohne Drift über den Clip. Je Pfote:
  // - Schreiten (Pfoten heben kaum ab): Weg der Pfote nach hinten / Zeit, in der sie nach hinten wandert (das ist die Standphase);
  // - Rennen (Sprünge, Pfoten hoch in der Luft): Tempo nach hinten in den Bildern nahe dem tiefsten Punkt (Standphase kurz und schnell).
  // Tempo = Median der vier Pfoten.
  const NF = Math.max(3, Math.round(dur * 60) + 1), ft = Array.from({ length: NF }, (_, i) => (i * dur) / (NF - 1)), fdt = dur / (NF - 1), fine = new Map();
  for (const ch of anim.channels) if (ch.target.path !== 'scale') { const v = sampleChannel(anim.samplers[ch.sampler], ft);
    if (ch.target.path === 'translation') { const d = v[NF - 1].map((x, c) => x - v[0][c]); v.forEach((q, i) => q.forEach((x, c) => { q[c] = x - (d[c] * i) / (NF - 1); })); }
    fine.set(ch.target.node + ch.target.path, v); }
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const feet = gltf.nodes.map((n, i) => [n.name || '', i]).filter(([n]) => /^(front|rear)Foot\.[LR]$/.test(n)).map(([, i]) => i);
  const footV = feet.map((fi) => {
    const ps = ft.map((_, f) => footAt(fi, fine, f)), ys = ps.map((q) => q[1]), zs = ps.map((q) => q[2]), lo = Math.min(...ys), hi = Math.max(...ys);
    if ((hi - lo) * scale < 0.25) { let back = 0; for (let f = 0; f + 1 < NF; f++) if (zs[f + 1] < zs[f]) back++; return back ? ((Math.max(...zs) - Math.min(...zs)) / (back * fdt)) * scale : 0; }
    const vs = []; for (let f = 0; f + 1 < NF; f++) if (Math.max(ys[f], ys[f + 1]) - lo < 0.08 * (hi - lo)) vs.push(((zs[f] - zs[f + 1]) / fdt) * scale);
    return med(vs); });
  const speed = feet.length ? med(footV) : 0;
  if (stride > 0.05 / scale) console.log(`${key}: Tempo ${speed.toFixed(2)} m/s (Pfoten ${footV.map((v) => v.toFixed(2)).join(' ')})`);
  clips[key] = { d: +dur.toFixed(4), n: frames, stride: +(stride * scale).toFixed(4), v: +speed.toFixed(4), tracks };
}

/* ---------- Textur: verkleinert, Lücken zwischen den Inseln aufgefüllt (sonst dunkle Nähte), als PNG ---------- */
function shrinkTexture() {
  const f = tex.w / TEX, out = new Float32Array(TEX * TEX * 3), have = new Uint8Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) { const o = ((y * f + yy) * tex.w + x * f + xx) * tex.bpp, R = tex.px[o], G = tex.px[o + 1], B = tex.px[o + 2]; if (R + G + B < 12) continue; r += R; g += G; b += B; n++; }
    if (n > f * f * 0.25) { const i = y * TEX + x; out[i * 3] = r / n; out[i * 3 + 1] = g / n; out[i * 3 + 2] = b / n; have[i] = 1; }
  }
  for (let pass = 0; pass < 12; pass++) {   // leere Pixel aus belegten Nachbarn füllen
    const add = [];
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) { const i = y * TEX + x; if (have[i]) continue; let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= TEX || Y >= TEX) continue; const j = Y * TEX + X; if (!have[j]) continue; r += out[j * 3]; g += out[j * 3 + 1]; b += out[j * 3 + 2]; n++; }
      if (n) add.push([i, r / n, g / n, b / n]); }
    for (const [i, r, g, b] of add) { out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b; have[i] = 1; }
  }
  // Palette mit 256 Farben: häufigste Farbfächer (4 Bit je Kanal), jedes Pixel bekommt die nächste Palettenfarbe
  const bins = new Map();
  for (let i = 0; i < TEX * TEX; i++) { const k = (out[i * 3] >> 4) << 8 | (out[i * 3 + 1] >> 4) << 4 | (out[i * 3 + 2] >> 4); const e = bins.get(k) || bins.set(k, [0, 0, 0, 0]).get(k); e[0] += out[i * 3]; e[1] += out[i * 3 + 1]; e[2] += out[i * 3 + 2]; e[3]++; }
  const pal = [...bins.values()].sort((a, b) => b[3] - a[3]).slice(0, 256).map((e) => [e[0] / e[3], e[1] / e[3], e[2] / e[3]].map(Math.round));
  const near = new Map(), idx = new Uint8Array(TEX * TEX);
  for (let i = 0; i < TEX * TEX; i++) { const k = (out[i * 3] >> 3) << 10 | (out[i * 3 + 1] >> 3) << 5 | (out[i * 3 + 2] >> 3);
    let c = near.get(k); if (c === undefined) { let bd = 1e9; pal.forEach((p, j) => { const d = (p[0] - out[i * 3]) ** 2 + (p[1] - out[i * 3 + 1]) ** 2 + (p[2] - out[i * 3 + 2]) ** 2; if (d < bd) { bd = d; c = j; } }); near.set(k, c); }
    idx[i] = c; }
  const raw = Buffer.alloc(TEX * (TEX + 1));
  for (let y = 0; y < TEX; y++) { raw[y * (TEX + 1)] = 0; for (let x = 0; x < TEX; x++) raw[y * (TEX + 1) + 1 + x] = idx[y * TEX + x]; }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) : crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(TEX, 0); ihdr.writeUInt32BE(TEX, 4); ihdr[8] = 8; ihdr[9] = 3;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(pal.flat())), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
// Grauweiße Flecken außerhalb von Kopf und Brust (Stellen, die auf Meshys Ausgangsbild nicht zu sehen waren) mit Fellfarbe übermalen:
// Dreiecke im hinteren 60 % des Körpers, deren Textur teils grauweiß ist; nur die grauweißen Pixel darin werden ersetzt.
function repaintGrey() {
  const grey = (o) => { const r = tex.px[o], g = tex.px[o + 1], b = tex.px[o + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx + mn > 24 && (mx - mn) / mx < 0.15 && (mx + mn) / 510 > 0.45; };
  let fr = 0, fg = 0, fb = 0, fn = 0;   // Fellfarbe: Mittel der kräftig gefärbten Pixel
  for (let o = 0; o < tex.px.length; o += tex.bpp * 7) { const r = tex.px[o], g = tex.px[o + 1], b = tex.px[o + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx > 90 && (mx - mn) / mx > 0.45) { fr += r; fg += g; fb += b; fn++; } }
  fr /= fn; fg /= fn; fb /= fn;
  let painted = 0;
  for (let t = 0; t < nT; t++) {
    let z = 0; for (let k = 0; k < 3; k++) z += rest[IDX[t * 3 + k] * 3 + 2] / 3;
    if (z > minZ + 0.6 * (maxZ - minZ)) continue;
    const uv = [0, 1, 2].map((k) => { const i = IDX[t * 3 + k]; return [UV[i * 2] * tex.w, UV[i * 2 + 1] * tex.h]; });
    const x0 = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[0]))) - 2), x1 = Math.min(tex.w - 1, Math.ceil(Math.max(...uv.map((p) => p[0]))) + 2);
    const y0 = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[1]))) - 2), y1 = Math.min(tex.h - 1, Math.ceil(Math.max(...uv.map((p) => p[1]))) + 2);
    const [A, B, C] = uv, den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (!den) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / den, l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < -0.05 || l2 < -0.05 || l3 < -0.05) continue;
      const o = (y * tex.w + x) * tex.bpp; if (!grey(o)) continue;
      tex.px[o] = fr; tex.px[o + 1] = fg; tex.px[o + 2] = fb; painted++;
    }
  }
  console.log(`Grauweiß übermalt: ${painted} Pixel`);
}
if (process.argv.includes("--repaint-grey")) repaintGrey();
const png = shrinkTexture();
const NRM = accessor(prim.attributes.NORMAL);

/* ---------- Ausgabe ---------- */
const maxAbs = Math.max(...Array.from(P).map(Math.abs)), qs = 32000 / maxAbs;
const r6 = (a) => a.map((x) => +x.toFixed(6));
const data = {
  scale: +scale.toFixed(5), yOff: +(-minY * scale).toFixed(5), q: +qs.toFixed(3),
  pos: b64(Int16Array, Array.from(P).map((x) => Math.round(x * qs))),
  joints: b64(Uint8Array, Array.from(J)), weights: b64(Uint8Array, Array.from(W).map((x) => Math.round(x * 255))),
  index: b64(Uint16Array, Array.from(IDX)), cls: b64(Uint8Array, Array.from(cls)),
  uv: b64(Uint16Array, Array.from(UV).map((x) => Math.round(Math.min(1, Math.max(0, x)) * 65535))), normal: b64(Int8Array, Array.from(NRM).map((x) => Math.round(x * 127))),
  tex: 'data:image/png;base64,' + png.toString('base64'),
  nodes: nodes.map((n) => ({ n: n.n, p: n.p, t: r6(n.t), r: r6(n.r), s: r6(n.s) })),
  mesh: nodeOf.get(meshNodeIdx), bones: skin.joints.map((j) => nodeOf.get(j)), ibm: b64(Float32Array, Array.from(IBM)),
  fps: FPS, clips,
};
const file = `// Erzeugt mit tools/meshy-rig.cjs aus ${require('path').basename(src)} – nicht von Hand ändern.\n// ${nT} Dreiecke, ${skin.joints.length} Knochen, Clips: ${Object.keys(clips).join(', ')}.\nexport const ${NAME} = ${JSON.stringify(data)};\n`;
fs.writeFileSync(out, file);
console.log(`${out}: ${(file.length / 1024).toFixed(0)} KB; Clips ${Object.entries(clips).map(([k, c]) => `${k} ${c.d}s/${c.tracks.length} Spuren`).join(', ')}`);
