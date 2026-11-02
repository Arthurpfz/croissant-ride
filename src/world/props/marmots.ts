import * as THREE from 'three';
import type { Route } from '../route';
import { beside, still, type Ground, type Rand, type Tick } from '../kit';

// marmots standing by their burrows on the high pastures from `from` to `to` m: one dives as you ride close, or when
// clicked, and pops back up once you're gone. Reduced motion: they stay up.
export default function marmots(p: { count: number; from: number; to: number; fur: string }, route: Route, ground: Ground, rand: Rand) {
  const group = new THREE.Group();
  if (!ground) return group;
  const fur = new THREE.MeshLambertMaterial({ color: p.fur, flatShading: true }), face = new THREE.MeshLambertMaterial({ color: new THREE.Color(p.fur).multiplyScalar(0.55) });
  const body = new THREE.SphereGeometry(0.2, 7, 5).scale(1, 1.55, 0.9).translate(0, 0.3, 0), head = new THREE.SphereGeometry(0.12, 7, 5).translate(0, 0.66, 0.03);
  const holeGeo = new THREE.CircleGeometry(0.3, 10).rotateX(-Math.PI / 2), holeMat = new THREE.MeshBasicMaterial({ color: '#1d1a16' });
  const hit = new THREE.BoxGeometry(1.4, 1.4, 1.4).translate(0, 0.5, 0), hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const all: { m: THREE.Group; y: number; down: number; away: number }[] = [];
  for (let tries = 0; all.length < p.count && tries < p.count * 40; tries++) {
    const at = beside(route, p.from + rand() * (p.to - p.from), (rand() < 0.5 ? -1 : 1) * (8 + rand() * 32));
    const y = ground(at.x, at.z);
    if (Math.hypot(ground(at.x + 2, at.z) - ground(at.x - 2, at.z), ground(at.x, at.z + 2) - ground(at.x, at.z - 2)) / 4 > 0.6) continue;
    const m = new THREE.Group(), animal = new THREE.Group().add(new THREE.Mesh(body, fur), new THREE.Mesh(head, face));
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.set(0.35, 0.02, 0);
    const target = new THREE.Mesh(hit, hitMat);
    m.add(animal, hole, target);
    m.position.set(at.x, y, at.z);
    m.scale.setScalar(1.3); // a touch big, so they get noticed
    m.rotation.y = at.yaw + (Math.PI / 2) * (rand() < 0.5 ? 1 : -1); // side-on to the road
    const me = { m, y, down: 0, away: 0 };
    target.userData.click = () => alarm(me);
    all.push(me);
    group.add(m);
  }
  function alarm(me: { down: number; away: number; m: THREE.Group }) {
    if (me.down > 0 || still()) return;
    me.down = 0.001; me.away = 25 + Math.random() * 35;
  }
  group.userData.tick = ((dt, at) => {
    for (const me of all) {
      const d = me.m.position.distanceTo(at);
      if (me.down === 0 && d < 28 && Math.random() < dt * 2) alarm(me);
      if (me.down > 0) {
        me.down = Math.min(1, me.down + dt * 3);
        if ((me.away -= dt) <= 0 && d > 60) me.down = 0;
      }
      me.m.children[0].position.y = -0.75 * me.down; // into the burrow
    }
  }) as Tick;
  return group;
}
