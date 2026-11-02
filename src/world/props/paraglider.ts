import * as THREE from 'three';
import { lerp, still, type Tick } from '../kit';

// a paraglider drifting slowly across the valley ahead every `every` [min, max] seconds while the rider is below
// `below` m; none under reduced motion
export default function paraglider(p: { every: [number, number]; below: number; wing: string[] }) {
  const glider = new THREE.Group();
  const cells = 9;
  for (let i = 0; i < cells; i++) { // canopy: cells along an arch, the colours repeating
    const a = (i / (cells - 1) - 0.5) * 2.2;
    const cell = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.3, 2.2), new THREE.MeshLambertMaterial({ color: p.wing[i % p.wing.length] }));
    cell.position.set(Math.sin(a) * 5, Math.cos(a) * 5 - 5 + 7, 0);
    cell.rotation.z = -a;
    glider.add(cell);
  }
  const lines = new THREE.BufferGeometry().setFromPoints([-1, 1].flatMap((s) => [new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(s * 4.4, 5, 0)]));
  glider.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: '#3a3a3a' })), new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.6), new THREE.MeshLambertMaterial({ color: '#2b2c30' })));
  glider.scale.setScalar(1.6);
  glider.visible = false;
  let wait = 30 + Math.random() * 60, left = 0;
  const vel = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
  glider.userData.tick = ((dt, at, forward) => {
    if (!glider.visible) {
      if (still() || at.y > p.below || (wait -= dt) > 0) return;
      side.crossVectors(forward, up).normalize();
      const s = Math.random() < 0.5 ? 1 : -1;
      glider.position.copy(at).addScaledVector(forward, 500 + Math.random() * 500).addScaledVector(side, -s * 700).setY(at.y + 220 + Math.random() * 120);
      vel.copy(side).multiplyScalar(s * 9).addScaledVector(forward, -2).setY(-0.6); // drifting across, slowly sinking
      glider.lookAt(glider.position.clone().add(vel.clone().setY(0)));
      left = 150;
      glider.visible = true;
    }
    glider.position.addScaledVector(vel, dt);
    glider.rotation.z = Math.sin((left -= dt) * 0.4) * 0.12; // gentle sway
    if (left <= 0) { glider.visible = false; wait = lerp(p.every[0], p.every[1], Math.random()); }
  }) as Tick;
  return glider;
}
