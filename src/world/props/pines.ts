import * as THREE from 'three';
import type { Route } from '../route';
import { fbm } from '../noise';
import { lerp, type Ground, type Rand } from '../kit';

// cone pines in noise patches on the ground, kept off the road and out of the water and high rock: in a ring round
// the origin (a loop's valley), or up to `along` m either side of the road; `maxSlope` keeps them off cliffs
export default function pines(p: { count: number; from: number; patches: number; maxHeight: number; trunk: string; hue: [number, number]; along?: number; maxSlope?: number }, route: Route, ground: Ground, rand: Rand) {
  const group = new THREE.Group();
  if (!ground) return group;
  const COUNT = p.count;
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 8, 6), new THREE.MeshLambertMaterial({ flatShading: true }), COUNT);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 2.5, 5), new THREE.MeshLambertMaterial({ color: p.trunk }), COUNT);
  crown.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < COUNT && tries < COUNT * 20; tries++) {
    const o = p.along ? route.samples[Math.floor(rand() * route.samples.length)] : { x: 0, z: 0 };
    const a = rand() * Math.PI * 2, r = p.along ? p.from + rand() * p.along : 300 + Math.sqrt(rand()) * 3600;
    const x = o.x + Math.cos(a) * r, z = o.z + Math.sin(a) * r;
    if (fbm(x / 300, z / 300) < p.patches) continue; // forest patches
    if (route.nearRoad(x, z).dist < p.from) continue;
    const h = ground(x, z);
    if (h < -1 || h > p.maxHeight) continue; // water at -3
    if (p.maxSlope && Math.hypot(ground(x + 3, z) - ground(x - 3, z), ground(x, z + 3) - ground(x, z - 3)) / 6 > p.maxSlope) continue;
    const k = 0.7 + rand() * 0.8;
    s.set(k, k * (0.8 + rand() * 0.5), k);
    m.compose(v.set(x, h + 1.25 * s.y, z), q, s);
    trunk.setMatrixAt(n, m);
    m.compose(v.set(x, h + 2.5 * s.y + 4 * s.y, z), q, s);
    crown.setMatrixAt(n, m);
    crown.setColorAt(n, col.setHSL(lerp(p.hue[0], p.hue[1], rand()), 0.45, 0.18 + rand() * 0.1));
    n++;
  }
  crown.count = trunk.count = n;
  group.add(crown, trunk);
  return group;
}
