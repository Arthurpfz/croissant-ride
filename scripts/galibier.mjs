// One-off build of worlds/routes/galibier/ from IGN open data (Licence Ouverte 2.0): the D902 from Valloire to the
// summit (BD TOPO, with its surveyed heights), the terrain around it (RGE ALTI), aerial photos of that terrain
// (ORTHO-EXPRESS) and what stands on it (BD TOPO buildings, forest, place names, the tunnel).
// Run: node scripts/galibier.mjs (`--scenery` keeps the road and heights on disk and rebuilds only the photos and
// scenery; these need sharp, which is not a dependency of the app: npm i --no-save sharp)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

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
// --scenery: the road and heights on disk stay as they are (IGN's data moves a little from one edition to the next)
const kept = process.argv.includes('--scenery') ? JSON.parse(readFileSync(new URL('route.json', OUT))) : null;
const road = kept?.line ?? line.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]);
const xs = road.map(([x]) => x), zs = road.map(([, z]) => z), snap = (v, c) => Math.floor(v / c) * c;
const FINE = 15, M = 600, fx = snap(Math.min(...xs) - M, FINE), fz = snap(Math.min(...zs) - M, FINE);
const fine = kept?.terrain[0] ?? await grid('fine.bin', fx, fz, Math.ceil((Math.max(...xs) + M - fx) / FINE) + 1, Math.ceil((Math.max(...zs) + M - fz) / FINE) + 1, FINE);
const COARSE = 100, H = 18000, cx = snap((Math.min(...xs) + Math.max(...xs)) / 2 - H, COARSE), cz = snap((Math.min(...zs) + Math.max(...zs)) / 2 - H, COARSE);
const coarse = kept?.terrain[1] ?? await grid('coarse.bin', cx, cz, (2 * H) / COARSE + 1, (2 * H) / COARSE + 1, COARSE);

// --- photos: an aerial photo of each grid's rectangle, north up ---------------------------------------------------
// ORTHO-EXPRESS is one flight per département, so one light and one season across the whole climb (the yearly
// mosaic changes tone in patches). Savoie's 2024 flight comes first; the Hautes-Alpes side is the 2025 one, its
// colours pulled to the 2024 ones (same mean and spread where the two overlap) and faded in over the last FADE px.
const sharp = (await import('sharp')).default;
const FLIGHTS = ['ORTHOIMAGERY.ORTHOPHOTOS.ORTHO-EXPRESS.2024', 'ORTHOIMAGERY.ORTHOPHOTOS.ORTHO-EXPRESS.2025'], FADE = 12;
async function flight(layer, g, W, Hpx) {
  const w = (g.nx - 1) * g.cell, d = (g.nz - 1) * g.cell, u = new URL('https://data.geopf.fr/wms-r');
  Object.entries({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: layer, STYLES: '', CRS: 'EPSG:4326', FORMAT: 'image/png', WIDTH: W, HEIGHT: Hpx,
    BBOX: [lat0 - (g.z0 + d) / kz, lon0 + g.x0 / kx, lat0 - g.z0 / kz, lon0 + (g.x0 + w) / kx].map((v) => v.toFixed(7)).join(','),
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  if (!r.ok || !r.headers.get('content-type').startsWith('image/')) throw new Error(`${layer} ${r.status} ${await r.text()}`);
  return sharp(Buffer.from(await r.arrayBuffer())).removeAlpha().raw().toBuffer();
}
async function photo(file, g, W) { // W ≤ 4096 either way: the largest texture every phone takes
  const Hpx = Math.round((W * (g.nz - 1)) / (g.nx - 1)), n = W * Hpx;
  const [a, b] = await Promise.all(FLIGHTS.map((l) => flight(l, g, W, Hpx)));
  // where a flight has nothing the service answers white; its last 3 px are a blend with that white, so they go too
  const cover = async (p) => {
    const m = Buffer.alloc(n);
    for (let i = 0; i < n; i++) m[i] = p[i * 3] + p[i * 3 + 1] + p[i * 3 + 2] < 765 ? 255 : 0;
    return [(await sharp(m, { raw: { width: W, height: Hpx, channels: 1 } }).blur(1.5).extractChannel(0).raw().toBuffer()).map((v) => (v > 252 ? 255 : 0)), m];
  };
  const [[ca], [cb, any]] = [await cover(a), await cover(b)];
  const gain = [1, 1, 1], lift = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let k = 0, sa = 0, sb = 0, qa = 0, qb = 0;
    for (let i = 0; i < n; i++) if (ca[i] && cb[i]) { const va = a[i * 3 + c], vb = b[i * 3 + c]; k++; sa += va; sb += vb; qa += va * va; qb += vb * vb; }
    if (k < 1000) continue;
    gain[c] = Math.sqrt((qa / k - (sa / k) ** 2) / (qb / k - (sb / k) ** 2));
    lift[c] = sa / k - gain[c] * (sb / k);
  }
  const soft = await sharp(Buffer.from(ca), { raw: { width: W, height: Hpx, channels: 1 } }).blur(FADE / 2).extractChannel(0).raw().toBuffer();
  const out = Buffer.alloc(n * 3);
  const TONE = Array.from({ length: 256 }, (_, v) => Math.round(12 + 243 * (v / 255) ** 0.8)); // the flights are dark, their shadows near black: lift both
  for (let i = 0; i < n; i++) {
    const wa = !ca[i] ? 0 : !cb[i] ? 1 : Math.min(1, Math.max(0, (soft[i] / 255 - 0.5) * 2)); // 2024's share: all of it inside its cover, none at its edge
    for (let c = 0; c < 3; c++) out[i * 3 + c] = TONE[Math.max(0, Math.min(255, Math.round(wa * a[i * 3 + c] + (1 - wa) * (any[i] ? gain[c] * b[i * 3 + c] + lift[c] : 255))))];
  }
  await sharp(out, { raw: { width: W, height: Hpx, channels: 3 } }).webp({ quality: 80 }).toFile(new URL(file, OUT).pathname);
  console.log(`${file}  ${W}×${Hpx}, ${((g.nx - 1) * g.cell / W).toFixed(1)} m a pixel, 2025 colours ×${gain.map((v) => v.toFixed(2))} +${lift.map((v) => v.toFixed(0))}`);
  return file;
}
fine.photo = await photo('fine.webp', fine, Math.floor((4096 * (fine.nx - 1)) / (fine.nz - 1)));
coarse.photo = await photo('coarse.webp', coarse, 1800);

// --- scenery: what BD TOPO has standing beside the road -----------------------------------------------------------
async function topo(type, where = '') {
  const all = [];
  for (let start = 0; ; start += 5000) {
    const u = new URL(wfs);
    u.searchParams.set('TYPENAMES', `BDTOPO_V3:${type}`); u.searchParams.set('COUNT', '5000'); u.searchParams.set('STARTINDEX', start);
    u.searchParams.set('CQL_FILTER', `${where}BBOX(geometrie,${BOX.join(',')},'urn:ogc:def:crs:EPSG::4326')`);
    const got = (await (await fetch(u)).json()).features;
    all.push(...got);
    if (got.length < 5000) return all;
  }
}
const rings = (f) => f.geometry.coordinates.map((poly) => poly.map((ring) => ring.map(local))); // MultiPolygon → polygons of rings, in metres
const nearRoad = (x, z) => road.reduce((best, [rx, rz], i) => { const d = Math.hypot(rx - x, rz - z); return d < best.dist ? { dist: d, at: i * 10 } : best; }, { dist: Infinity, at: 0 });
const middle = (ring) => ring.reduce((s, [x, z]) => [s[0] + x / ring.length, s[1] + z / ring.length], [0, 0]);

// buildings within 700 m of the road: the smallest rectangle round each footprint [x, z, short side, long side,
// turn about the vertical (°, three.js y rotation: the short side is local x), height, 1 = church or chapel]
const buildings = [];
for (const f of await topo('batiment')) {
  if (f.properties.construction_legere || f.properties.etat_de_l_objet !== 'En service') continue;
  const ring = rings(f)[0][0];
  let best;
  for (let i = 1; i < ring.length; i++) {
    const t = Math.atan2(ring[i][1] - ring[i - 1][1], ring[i][0] - ring[i - 1][0]), c = Math.cos(t), s = Math.sin(t);
    const u = ring.map(([x, z]) => x * c + z * s), v = ring.map(([x, z]) => z * c - x * s);
    const u0 = Math.min(...u), u1 = Math.max(...u), v0 = Math.min(...v), v1 = Math.max(...v);
    if (!best || (u1 - u0) * (v1 - v0) < best.w * best.d) best = { t, w: u1 - u0, d: v1 - v0, x: ((u0 + u1) / 2) * c - ((v0 + v1) / 2) * s, z: ((u0 + u1) / 2) * s + ((v0 + v1) / 2) * c };
  }
  if (!best || best.w * best.d < 30 || nearRoad(best.x, best.z).dist > 700) continue;
  let { t, w, d } = best;
  if (w > d) { [w, d] = [d, w]; t += Math.PI / 2; } // d = the long side, where the roof ridge runs
  buildings.push([Math.round(best.x), Math.round(best.z), +w.toFixed(1), +d.toFixed(1), Math.round(((-t * 180) / Math.PI + 360) % 180), +(f.properties.hauteur ?? 5).toFixed(1), +/Eglise|Chapelle/.test(f.properties.nature)]);
}

// forest: one bit per cell of the fine grid, set where a wood or forest covers the cell's centre
const forest = new Uint8Array(Math.ceil((fine.nx * fine.nz) / 8));
let wooded = 0;
for (const f of await topo('zone_de_vegetation')) {
  if (!/^(Forêt|Bois)/.test(f.properties.nature)) continue;
  for (const poly of rings(f)) {
    const zr = poly[0].map(([, z]) => z), j0 = Math.max(0, Math.ceil((Math.min(...zr) - fine.z0) / fine.cell)), j1 = Math.min(fine.nz - 1, Math.floor((Math.max(...zr) - fine.z0) / fine.cell));
    for (let j = j0; j <= j1; j++) {
      const z = fine.z0 + j * fine.cell, cuts = []; // where this row crosses the polygon's rings (holes included: even-odd)
      for (const ring of poly) for (let i = 1; i < ring.length; i++) {
        const [x1, z1] = ring[i - 1], [x2, z2] = ring[i];
        if ((z1 <= z) !== (z2 <= z)) cuts.push(x1 + ((z - z1) / (z2 - z1)) * (x2 - x1));
      }
      cuts.sort((p, q) => p - q);
      for (let k = 0; k + 1 < cuts.length; k += 2) {
        for (let i = Math.max(0, Math.ceil((cuts[k] - fine.x0) / fine.cell)); i <= Math.min(fine.nx - 1, Math.floor((cuts[k + 1] - fine.x0) / fine.cell)); i++) {
          const bit = j * fine.nx + i;
          if (!(forest[bit >> 3] & (1 << (bit & 7)))) wooded++;
          forest[bit >> 3] |= 1 << (bit & 7);
        }
      }
    }
  }
}

// the places every profile of the climb names: [m along the road, name]
const PLACES = ['les Verneys', 'Bonnenuit', 'Plan Lachat', 'Granges du Galibier'];
const places = (await topo('zone_d_habitation')).filter((f) => PLACES.includes(f.properties.toponyme))
  .map((f) => [nearRoad(...middle(rings(f)[0][0])).at, f.properties.toponyme]).sort((p, q) => p[0] - q[0]);

// the tunnel under the col: its mouth beside the road [x, z, heading into the hill (°)]. The tunnel's pieces are
// chained end to end; the road passes beside the northern mouth and 90 m above the rest
const pieces902b = (await topo('troncon_de_route', "cpx_numero='D902B' AND position_par_rapport_au_sol='-1' AND ")).map((f) => f.geometry.coordinates.map(local));
const ends = pieces902b.flatMap((c) => [c, [...c].reverse()]).filter((c) => pieces902b.flat().filter((q) => Math.hypot(q[0] - c[0][0], q[1] - c[0][1]) < 1).length === 1);
const bore = ends.reduce((best, c) => (nearRoad(...c[0]).dist < nearRoad(...best[0]).dist ? c : best));
const tunnel = [Math.round(bore[0][0]), Math.round(bore[0][1]), Math.round((Math.atan2(bore[1][0] - bore[0][0], bore[1][1] - bore[0][1]) * 180) / Math.PI)];

writeFileSync(new URL('scenery.json', OUT), JSON.stringify({ buildings, places, tunnel, forest: Buffer.from(forest).toString('base64') }));
console.log(`scenery  ${buildings.length} buildings, ${wooded} wooded cells, tunnel ${nearRoad(tunnel[0], tunnel[1]).dist.toFixed(0)} m off the road at ${nearRoad(tunnel[0], tunnel[1]).at} m, places:`, places);

writeFileSync(new URL('route.json', OUT), JSON.stringify({
  name: 'Col du Galibier', oneWay: true, skin: 'le-col',
  licence: 'Licence Ouverte 2.0 (Etalab)', credit: 'Contains IGN data: BD TOPO®, RGE ALTI®, ORTHO-EXPRESS (2026)',
  terrain: [fine, coarse], scenery: 'scenery.json',
  line: road, elevation: kept?.elevation ?? elevation,
}));
