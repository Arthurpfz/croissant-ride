import * as THREE from 'three';
import { lerp, still, type Tick } from '../kit';

// a rare shooting star in the open sky right of the HUD: a thin streak, bright at the head and fading along the tail,
// crossing down and out in about a second. Placed in screen space so it is always visible and never over the road.
export default function meteor(p: { every: [number, number]; color: string }) {
  const geo = new THREE.CylinderGeometry(1, 0.1, 1, 6, 8, true).translate(0, -0.5, 0); // head at the origin, tail down -y
  const col: number[] = [], c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    c.set(p.color).multiplyScalar((1 + geo.attributes.position.getY(i)) ** 2);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const streak = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  streak.visible = false;
  const DUR = 1.1, Y = new THREE.Vector3(0, 1, 0), from = new THREE.Vector3(), to = new THREE.Vector3(), dir = new THREE.Vector3();
  const r = (a: number, b: number) => lerp(a, b, Math.random());
  let wait = r(30, 90), t = -1;
  streak.userData.tick = ((dt, _at, _f, camera) => {
    if (t < 0) {
      if ((wait -= dt) > 0) return;
      wait = r(p.every[0], p.every[1]);
      if (still()) return;
      // NDC start + end, pushed out to 3–5 km along the camera rays
      const d = r(3000, 5000), x = r(0.55, 0.8), y = r(0.45, 0.8);
      const at = (v: THREE.Vector3, nx: number, ny: number) => v.set(nx, ny, 0.5).unproject(camera).sub(camera.position).setLength(d).add(camera.position);
      at(from, x, y);
      at(to, x + r(0.2, 0.35), y - r(0.25, 0.4));
      dir.subVectors(to, from);
      streak.quaternion.setFromUnitVectors(Y, dir.clone().normalize());
      streak.scale.set(d * 6e-4, dir.length() * 0.45, d * 6e-4);
      streak.visible = true;
      t = 0;
    }
    t += dt / DUR;
    if (t >= 1) { streak.visible = false; t = -1; return; }
    streak.position.lerpVectors(from, to, t);
    (streak.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(t, 0, 0.15) * (1 - THREE.MathUtils.smoothstep(t, 0.55, 1));
  }) as Tick;
  return streak;
}
