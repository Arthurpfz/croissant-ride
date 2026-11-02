import * as THREE from 'three';
import type { Route } from '../route';
import { beside, type Ground, type Tick } from '../kit';

// a rare sighting: an ibex on the slope above the road `at` m along, there on a `chance` of your passes
export default function ibex(p: { at: number; chance: number; coat: string; horns: string }, route: Route, ground: Ground) {
  const coat = new THREE.MeshLambertMaterial({ color: p.coat, flatShading: true }), horn = new THREE.MeshLambertMaterial({ color: p.horns, flatShading: true });
  const animal = new THREE.Group();
  animal.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 1.2), coat).translateY(0.95));
  animal.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.3), coat).translateY(1.35).translateZ(0.62).rotateX(-0.5));
  animal.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.38), coat).translateY(1.6).translateZ(0.82));
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 5, 12, Math.PI * 0.95), horn); // long horns sweeping back
    h.position.set(s * 0.08, 1.62, 0.55);
    h.rotation.set(0, Math.PI / 2, 0);
    animal.add(h);
    for (const z of [-0.45, 0.45]) animal.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), coat).translateX(s * 0.15).translateY(0.35).translateZ(z));
  }
  // the higher side of the road, 30 m off
  const l = beside(route, p.at, -30), r = beside(route, p.at, 30), spot = (ground?.(l.x, l.z) ?? 0) > (ground?.(r.x, r.z) ?? 0) ? l : r;
  animal.position.set(spot.x, ground?.(spot.x, spot.z) ?? spot.y, spot.z);
  animal.rotation.y = spot.yaw + Math.PI * 0.7; // looking down at the road
  animal.visible = false;
  let armed = true;
  animal.userData.tick = ((_dt, at) => {
    const d = animal.position.distanceTo(at);
    if (armed && d < 700) { animal.visible = Math.random() < p.chance; armed = false; }
    if (d > 1200) armed = true; // decided again on the next pass
  }) as Tick;
  return animal;
}
