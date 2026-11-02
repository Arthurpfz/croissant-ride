// A route from a pack: closed road line + elevation profile. Drives grade, physics and the FIT; skins never change it.
import * as THREE from 'three';
import type { RouteData } from './packs';

const CELL = 150; // nearest-road bucket grid (m)
type Sample = { x: number; z: number; e: number };

export class Route {
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  readonly samples: Sample[]; // dense (x, z, elev) for terrain blending + minimap
  private buckets = new Map<string, Sample[]>();
  private tmp = new THREE.Vector3();
  readonly data: RouteData;

  constructor(data: RouteData) {
    this.data = data;
    this.curve = new THREE.CatmullRomCurve3(data.line.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    this.length = this.curve.getLength();
    this.samples = Array.from({ length: 1200 }, (_, i) => {
      const p = this.curve.getPointAt(i / 1200);
      return { x: p.x, z: p.z, e: this.profile(i / 1200) };
    });
    for (const s of this.samples) {
      const k = `${Math.floor(s.x / CELL)},${Math.floor(s.z / CELL)}`;
      (this.buckets.get(k) ?? this.buckets.set(k, []).get(k)!).push(s);
    }
  }

  frac(dist: number) { return (((dist / this.length) % 1) + 1) % 1; }

  // elevation (m) at loop fraction u: Catmull-Rom through the evenly spaced profile
  private profile(u: number) {
    const e = this.data.elevation, n = e.length;
    const t = u * n, i = Math.floor(t), f = t - i;
    const p0 = e[(i - 1 + n) % n], p1 = e[i % n], p2 = e[(i + 1) % n], p3 = e[(i + 2) % n];
    return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
  }

  elevAt(dist: number) { return this.profile(this.frac(dist)); }

  gradeAt(dist: number) {
    const h = 5;
    return ((this.elevAt(dist + h) - this.elevAt(dist - h)) / (2 * h)) * 100;
  }

  pose(dist: number, out = new THREE.Vector3()) {
    const u = this.frac(dist);
    this.curve.getPointAt(u, out);
    out.y = this.profile(u);
    const tangent = this.curve.getTangentAt(u, this.tmp).clone();
    tangent.y = this.gradeAt(dist) / 100;
    return { pos: out, tangent: tangent.normalize() };
  }

  nearRoad(x: number, z: number) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity, e = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const s of this.buckets.get(`${cx + i},${cz + j}`) ?? []) {
        const d = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d < best) { best = d; e = s.e; }
      }
    }
    return { dist: Math.sqrt(best), e };
  }
}

// the active route: physics, HUD and world all follow it
export let route: Route;
export const setRoute = (data: RouteData) => (route = route?.data === data ? route : new Route(data));
