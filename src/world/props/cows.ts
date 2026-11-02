import * as THREE from 'three';
import type { Route } from '../route';
import { beside, still, type Ground, type Rand, type Tick } from '../kit';

// grazing cows on the pasture beside the road from `from` to `to` m
export default function cows(p: { count: number; from: number; to: number; coats: string[] }, route: Route, ground: Ground, rand: Rand) {
  const group = new THREE.Group();
  if (!ground) return group;
  const mats = p.coats.map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  const dark = new THREE.MeshLambertMaterial({ color: '#2a2420' });
  const body = new THREE.BoxGeometry(0.7, 0.75, 1.7), head = new THREE.BoxGeometry(0.4, 0.42, 0.55), leg = new THREE.BoxGeometry(0.16, 0.7, 0.16).translate(0, -0.35, 0);
  const herd: THREE.Group[] = [];
  for (let tries = 0; herd.length < p.count && tries < p.count * 40; tries++) {
    const at = beside(route, p.from + rand() * (p.to - p.from), (rand() < 0.5 ? -1 : 1) * (16 + rand() * 70));
    const y = ground(at.x, at.z);
    if (Math.hypot(ground(at.x + 3, at.z) - ground(at.x - 3, at.z), ground(at.x, at.z + 3) - ground(at.x, at.z - 3)) / 6 > 0.45) continue;
    const coat = mats[Math.floor(rand() * mats.length)], cow = new THREE.Group();
    cow.add(new THREE.Mesh(body, coat).translateY(1.1));
    const h = new THREE.Mesh(head, rand() < 0.4 ? mats[1 % mats.length] : coat);
    h.position.set(0, 0.75, 1.0); // head down, grazing
    cow.add(h);
    for (const [x, z] of [[-0.24, 0.65], [0.24, 0.65], [-0.24, -0.65], [0.24, -0.65]]) cow.add(new THREE.Mesh(leg, dark).translateX(x).translateZ(z).translateY(0.75));
    cow.position.set(at.x, y - 0.05, at.z);
    cow.rotation.y = rand() * Math.PI * 2;
    cow.userData.head = h;
    cow.traverse((o) => { o.castShadow = true; });
    herd.push(cow);
    group.add(cow);
  }
  let time = 0;
  group.userData.tick = ((dt) => {
    time += dt;
    if (!still()) herd.forEach((c, i) => { c.userData.head.position.y = 0.75 + Math.max(0, Math.sin(time * 0.4 + i * 1.7)) * 0.35; });
  }) as Tick;
  return group;
}
