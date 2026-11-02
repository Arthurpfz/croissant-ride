import * as THREE from 'three';
import { lerp, type Tick } from '../kit';

// a starfighter that streaks past every `every` [min, max] seconds at `speed` m/s: across the road ahead,
// or from behind the rider, overhead and away into the distance with a roll
export default function flyby(p: { every: [number, number]; speed: number; hull: string; accent: string; canopy: string }) {
  const ship = fighter(p.hull, p.accent, p.canopy);
  ship.visible = false;
  let wait = 20 + Math.random() * 20, path: THREE.QuadraticBezierCurve3 | undefined, len = 0, u = 0, overtake = false, bank = 0;
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), tan = new THREE.Vector3(), next = new THREE.Vector3(), look = new THREE.Vector3();
  ship.userData.tick = ((dt, at, forward) => {
    if (!path) {
      if ((wait -= dt) > 0) return;
      side.crossVectors(forward, up).normalize();
      const s = Math.random() < 0.5 ? 1 : -1;
      const pt = (f: number, x: number, y: number) => at.clone().addScaledVector(forward, f).addScaledVector(side, x * s).addScaledVector(up, y);
      overtake = Math.random() < 0.6;
      path = overtake
        ? new THREE.QuadraticBezierCurve3(pt(-260, 30, 22), pt(120, 8, 26), pt(2400, -500, 160))
        : new THREE.QuadraticBezierCurve3(pt(80, -700, 12), pt(220, 0, 18), pt(80, 700, 30)); // low, under the HUD panel
      len = path.getLength();
      u = bank = 0;
      ship.visible = true;
    }
    u += (dt * p.speed) / len;
    if (u >= 1) {
      path = undefined;
      ship.visible = false;
      wait = lerp(p.every[0], p.every[1], Math.random());
      return;
    }
    path.getPointAt(u, ship.position);
    path.getTangentAt(u, tan);
    path.getTangentAt(Math.min(1, u + 0.02), next);
    ship.lookAt(look.copy(ship.position).add(tan));
    // bank into the turn (positive roll = right wing down), plus one full roll mid-way on the overtaking pass
    bank += (THREE.MathUtils.clamp(next.sub(tan).dot(side.crossVectors(tan, up).normalize()) * 25, -0.9, 0.9) - bank) * Math.min(1, dt * 3);
    ship.rotateZ(bank + (overtake ? Math.PI * 2 * THREE.MathUtils.smoothstep(u, 0.12, 0.24) : 0));
  }) as Tick;
  return ship;
}

// ~12 m long, nose +z: flat arrowhead wing with a notched tail, raised spine and canopy, engine pods on the wingtips
// with canted fins, glowing exhausts and fading trails
function fighter(hullHex: string, accentHex: string, canopyHex: string) {
  const ship = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: hullHex, metalness: 0.3, roughness: 0.45, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentHex).multiplyScalar(3) });
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    ship.add(m);
    return m;
  };
  const outline = [[0, 7.5], [1.1, 2.5], [5.5, -3], [5.5, -4.6], [1.8, -3.2], [0, -4.2]];
  const shape = new THREE.Shape([...outline, ...outline.slice(1, -1).reverse().map(([x, y]) => [-x, y])].map(([x, y]) => new THREE.Vector2(x, y)));
  const wing = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 1 });
  wing.rotateX(Math.PI / 2); // shape y → +z, thickness downwards
  part(wing, hull, 0, 0.17, 0);
  part(new THREE.OctahedronGeometry(1), hull, 0, 0.15, 0.8).scale.set(1, 0.7, 5.5);
  part(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: canopyHex, metalness: 0.9, roughness: 0.1, emissive: canopyHex, emissiveIntensity: 0.3 }), 0, 0.5, 2.2).scale.set(0.65, 0.55, 1.7);
  const pod = new THREE.CylinderGeometry(0.55, 0.45, 4.2, 10).rotateX(Math.PI / 2);
  const nozzle = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10).rotateX(Math.PI / 2);
  const fin = new THREE.BoxGeometry(0.12, 1.6, 1.8), stripe = new THREE.BoxGeometry(0.1, 0.06, 3.2);
  const TRAIL = 7, trail = new THREE.ConeGeometry(0.45, TRAIL, 10, 1, true);
  const pos = trail.attributes.position, cols: number[] = [], c = new THREE.Color(accentHex);
  for (let i = 0; i < pos.count; i++) { const k = (TRAIL / 2 - pos.getY(i)) / TRAIL; cols.push(c.r * k, c.g * k, c.b * k); } // bright at the nozzle, fading out
  trail.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  trail.rotateX(-Math.PI / 2).translate(0, 0, -TRAIL / 2); // apex backwards
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const s of [-1, 1]) {
    part(pod, hull, s * 5.5, 0, -2.6);
    part(nozzle, glow, s * 5.5, 0, -4.72);
    part(trail, trailMat, s * 5.5, 0, -4.75);
    part(fin, hull, s * 5.75, 0.9, -3.6).rotation.z = -s * 0.35;
    part(stripe, glow, s * 5.5, 0.55, -2.4);
  }
  return ship;
}
