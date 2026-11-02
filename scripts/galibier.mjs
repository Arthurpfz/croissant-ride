// One-off build of worlds/routes/galibier/ from IGN open data (Licence Ouverte 2.0): the D902 from Valloire to the
// summit (BD TOPO, with its surveyed heights) and the terrain around it (RGE ALTI). Run: node scripts/galibier.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../worlds/routes/galibier/', import.meta.url);
const START = [6.43185, 45.16515]; // the roundabout in Valloire's centre
const BOX = [45.04, 6.37, 45.18, 6.47]; // lat/lon box holding the climb
const R = 6371008.8;

// --- road: D902 pieces, chained from Valloire to the highest point (tunnel excluded: closed to bikes) ---------------
const wfs = new URL('https://data.geopf.fr/wfs/ows');
Object.entries({
  SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'BDTOPO_V3:troncon_de_route', OUTPUTFORMAT: 'application/json', COUNT: '2000',
  CQL_FILTER: `cpx_numero='D902' AND BBOX(geometrie,${BOX.join(',')},'urn:ogc:def:crs:EPSG::4326')`,
}).forEach(([k, v]) => wfs.searchParams.set(k, v));
const { features } = await (await fetch(wfs)).json();
const pieces = features.filter((f) => +f.properties.position_par_rapport_au_sol >= 0).map((f) => f.geometry.coordinates);

const key = ([lon, lat]) => `${lon.toFixed(7)},${lat.toFixed(7)}`;
const lon0 = (BOX[1] + BOX[3]) / 2, lat0 = (BOX[0] + BOX[2]) / 2, kx = (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180), kz = (Math.PI / 180) * R;
const local = ([lon, lat]) => [(lon - lon0) * kx, -(lat - lat0) * kz]; // x east, z south (metres)
const len = (c) => c.slice(1).reduce((s, p, i) => s + Math.hypot(...local(p).map((v, j) => v - local(c[i])[j])), 0);

const edges = new Map(); // node → [{ to, w, coords }]
const node = new Map(); // key → coordinate
for (const c of pieces) {
  const a = key(c[0]), b = key(c.at(-1)), w = len(c);
  node.set(a, c[0]); node.set(b, c.at(-1));
  (edges.get(a) ?? edges.set(a, []).get(a)).push({ to: b, w, coords: c });
  (edges.get(b) ?? edges.set(b, []).get(b)).push({ to: a, w, coords: [...c].reverse() });
}
const nearest = (p) => [...node].reduce((best, [k, c]) => (Math.hypot(...local(c).map((v, j) => v - local(p)[j])) < best.d ? { k, d: Math.hypot(...local(c).map((v, j) => v - local(p)[j])) } : best), { k: '', d: Infinity }).k;
const from = nearest(START), to = [...node].reduce((a, b) => (b[1][2] > a[1][2] ? b : a))[0];

// Dijkstra (a few hundred nodes: a plain scan is enough)
const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
while (true) {
  let u, du = Infinity;
  for (const [k, d] of dist) if (!done.has(k) && d < du) { u = k; du = d; }
  if (!u || u === to) break;
  done.add(u);
  for (const e of edges.get(u) ?? []) if (du + e.w < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, du + e.w); prev.set(e.to, { from: u, e }); }
}
const path = [];
for (let k = to; k !== from; k = prev.get(k).from) path.unshift(...prev.get(k).e.coords.slice(1));
path.unshift(node.get(from));

// resample every 10 m along the road (x, z, surveyed height)
const pts = path.map((c) => [...local(c), c[2]]);
const acc = [0];
for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
const L = acc.at(-1);
const at = (d) => {
  let i = acc.findIndex((a) => a >= d);
  if (i <= 0) i = 1;
  const t = (d - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
  return pts[i - 1].map((v, j) => v + (pts[i][j] - v) * t);
};
const line = Array.from({ length: Math.floor(L / 10) + 1 }, (_, i) => at(Math.min(L, i * 10)));
line[line.length - 1] = at(L);

// heights every 20 m, smoothed over ~100 m (Gaussian, σ 40 m) so the trainer's resistance doesn't jerk; past each end
// the road is mirrored through the end point, so the start and summit keep their real height and gradient
const raw = Array.from({ length: Math.round(L / 20) + 1 }, (_, i) => at((i / Math.round(L / 20)) * L)[2]);
const step = L / (raw.length - 1), sigma = 40 / step, n = raw.length - 1;
const pad = (j) => (j < 0 ? 2 * raw[0] - raw[-j] : j > n ? 2 * raw[n] - raw[2 * n - j] : raw[j]);
const elevation = raw.map((_, i) => {
  let s = 0, w = 0;
  for (let j = i - Math.ceil(3 * sigma); j <= i + Math.ceil(3 * sigma); j++) {
    const k = Math.exp(-(((j - i) / sigma) ** 2) / 2);
    s += pad(j) * k; w += k;
  }
  return +(s / w).toFixed(1);
});

// --- check against the published climb -------------------------------------------------------------------------
const e = (d) => { const t = d / step, i = Math.min(elevation.length - 2, Math.floor(t)); return elevation[i] + (elevation[i + 1] - elevation[i]) * (t - i); };
let up = 0, maxKm = 0, maxGrade = 0;
for (let i = 1; i < elevation.length; i++) up += Math.max(0, elevation[i] - elevation[i - 1]);
for (let d = 0; d + 100 <= L; d += 20) maxGrade = Math.max(maxGrade, (e(d + 100) - e(d)));
console.log(`length ${(L / 1000).toFixed(2)} km · ${elevation[0]} → ${elevation.at(-1)} m · up ${up.toFixed(0)} m · avg ${(((elevation.at(-1) - elevation[0]) / L) * 100).toFixed(2)} % · steepest 100 m ${maxGrade.toFixed(1)} %`);
for (let k = 0; k < L / 1000; k++) {
  const a = k * 1000, b = Math.min(L, a + 1000), g = ((e(b) - e(a)) / (b - a)) * 100;
  maxKm = Math.max(maxKm, g);
  console.log(`km ${String(k + 1).padStart(2)}  ${e(a).toFixed(0)} m  ${g.toFixed(1)} %`);
}
console.log(`steepest km ${maxKm.toFixed(1)} %`);

if (process.argv.includes('--road')) process.exit(0);

// --- terrain: RGE ALTI heights on a fine grid round the road and a coarse one out to the far peaks ----------------
// Stored as Uint16 decimetres, row by row (z), west → east (x).
const ALTI = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
async function heights(xz) {
  const body = JSON.stringify({
    lon: xz.map(([x]) => (lon0 + x / kx).toFixed(6)).join('|'), lat: xz.map(([, z]) => (lat0 - z / kz).toFixed(6)).join('|'),
    resource: 'ign_rge_alti_wld', zonly: 'true', delimiter: '|',
  });
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(ALTI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (r.ok) return (await r.json()).elevations;
      if (tries > 4) throw new Error(`altimetry ${r.status}`);
    } catch (err) { if (tries > 4) throw err; }
    await new Promise((res) => setTimeout(res, 1000 * (tries + 1)));
  }
}
async function grid(file, x0, z0, nx, nz, cell) {
  const xz = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) xz.push([x0 + i * cell, z0 + j * cell]);
  const out = new Uint16Array(xz.length), BATCH = 5000;
  const batches = Array.from({ length: Math.ceil(xz.length / BATCH) }, (_, b) => b);
  let missing = 0;
  for (let b = 0; b < batches.length; b += 3) { // 3 requests at a time: the API allows 5 a second
    await Promise.all(batches.slice(b, b + 3).map(async (k) => {
      const h = await heights(xz.slice(k * BATCH, (k + 1) * BATCH));
      h.forEach((v, i) => { if (v < -100) missing++; out[k * BATCH + i] = Math.max(0, Math.round(v * 10)); });
    }));
    process.stdout.write(`\r${file} ${Math.min(100, Math.round(((b + 3) / batches.length) * 100))} %`);
  }
  console.log(`  ${nx}×${nz} @ ${cell} m, ${missing} missing`);
  writeFileSync(new URL(file, OUT), out);
  return { file, x0, z0, nx, nz, cell };
}
mkdirSync(OUT, { recursive: true });
const xs = line.map(([x]) => x), zs = line.map(([, z]) => z), snap = (v, c) => Math.floor(v / c) * c;
const FINE = 15, M = 600, fx = snap(Math.min(...xs) - M, FINE), fz = snap(Math.min(...zs) - M, FINE);
const fine = await grid('fine.bin', fx, fz, Math.ceil((Math.max(...xs) + M - fx) / FINE) + 1, Math.ceil((Math.max(...zs) + M - fz) / FINE) + 1, FINE);
const COARSE = 100, H = 18000, cx = snap((Math.min(...xs) + Math.max(...xs)) / 2 - H, COARSE), cz = snap((Math.min(...zs) + Math.max(...zs)) / 2 - H, COARSE);
const coarse = await grid('coarse.bin', cx, cz, (2 * H) / COARSE + 1, (2 * H) / COARSE + 1, COARSE);

writeFileSync(new URL('route.json', OUT), JSON.stringify({
  name: 'Col du Galibier', oneWay: true, skin: 'le-col',
  licence: 'Licence Ouverte 2.0 (Etalab)', credit: 'Contains IGN data: BD TOPO®, RGE ALTI® (2026)',
  terrain: [fine, coarse],
  line: line.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]), elevation,
}));
