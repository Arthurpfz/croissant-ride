// Low-poly time-trial rider on a TT bike, built from primitives. Each skin designs its own rider (suit, helmet, visor)
// and bike (frame, wheels, optional glowing wheel edges); the rig is shared, so every rider pedals the same way.
// Forward = +z, ground at y = 0. Legs follow the crank via 2-bone IK.
import * as THREE from 'three';
import type { SkinData } from './packs';

const mat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const cyl = new THREE.CylinderGeometry(1, 1, 1, 8); // shared; a disposed geometry re-uploads on next use
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const WHEEL_R = 0.34, CRANK = 0.17, THIGH = 0.46, SHIN = 0.45;
const REAR = v(0, WHEEL_R, -0.5), FRONT = v(0, WHEEL_R, 0.52);
const BB = v(0, 0.29, -0.04);
const HIP = v(0, 0.98, -0.12); // steep TT seat angle: hips forward over the cranks
const SHOULDER = v(0, 1.16, 0.36); // flat back
const UP = v(0, 1, 0);

// a tube from a to b; w/d = half-width (sideways) and half-depth (in the bike's plane), so aero tubes can be flat
function tube(m: THREE.Material, w: number, d = w) {
  const mesh = new THREE.Mesh(cyl, m);
  mesh.castShadow = true;
  mesh.userData.w = w; mesh.userData.d = d;
  return mesh;
}
const dir = new THREE.Vector3();
function place(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  dir.subVectors(b, a);
  const len = dir.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.scale.set(mesh.userData.w, len, mesh.userData.d);
  return mesh;
}
function ball(r: number, m: THREE.Material, p: THREE.Vector3, s: [number, number, number] = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m);
  mesh.position.copy(p);
  mesh.scale.set(...s);
  mesh.castShadow = true;
  return mesh;
}
function box(size: [number, number, number], m: THREE.Material, p: THREE.Vector3) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
  mesh.position.copy(p);
  mesh.castShadow = true;
  return mesh;
}

// deep = deep-section rim with spokes, disc = solid lens; glow = neon rings on both faces of the rim
function wheel(kind: 'deep' | 'disc', tyres: THREE.Material, rims: THREE.Material, glow?: THREE.Material) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.012, 0.012, 6, 32), tyres);
  tyre.rotation.y = Math.PI / 2;
  // rim cross-section (radius, sideways) spun around the axle; the disc is a lens, thicker at the hub
  const ro = WHEEL_R - 0.02, ri = kind === 'disc' ? 0.02 : WHEEL_R - 0.09, hw = 0.013, t = kind === 'disc' ? 0.028 : hw * 0.6;
  const profile = [[ri, -t], [ro, -hw], [ro, hw], [ri, t], [ri, -t]].map(([x, y]) => new THREE.Vector2(x, y));
  const rim = new THREE.Mesh(new THREE.LatheGeometry(profile, 32).rotateZ(Math.PI / 2), rims);
  tyre.castShadow = rim.castShadow = true;
  g.add(tyre, rim, place(tube(rims, 0.025), v(-0.05, 0, 0), v(0.05, 0, 0)));
  if (kind === 'deep') {
    const pts: number[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, s = i % 2 ? 1 : -1;
      pts.push(0.03 * s, Math.cos(a) * 0.025, Math.sin(a) * 0.025, 0, Math.cos(a) * ri, Math.sin(a) * ri);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9aa0a8 })));
  }
  if (glow) for (const x of [-hw - 0.002, hw + 0.002]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ro - 0.012, 0.005, 4, 48), glow);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = x;
    g.add(ring);
  }
  return g;
}

export class Rider {
  group = new THREE.Group();
  private body = new THREE.Group(); // upper body: rolls a little with each pedal stroke
  private wheels: THREE.Group[] = [];
  private crankArms: THREE.Mesh[] = [];
  private legs: { thigh: THREE.Mesh; knee: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh; x: number }[] = [];
  private crank = 0;
  private t = 0;

  constructor(r: SkinData['rider'], b: SkinData['bike']) {
    const g = this.group;
    g.name = 'rider';
    const SUIT = mat(r.suit), ACCENT = mat(r.accent), SKIN = mat(r.skin), HELMET = mat(r.helmet), SHOES = mat(r.shoes);
    const VISOR = new THREE.MeshPhongMaterial({ color: r.visor, shininess: 90, specular: 0xffffff, flatShading: true });
    const FRAME = mat(b.frame), TRIM = mat(b.accent), PARTS = mat(b.parts), TYRES = mat(b.tyres), RIMS = mat(b.rims);
    const GLOW = b.glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(b.glow).multiplyScalar(2.5) }) : undefined;

    // wheels
    for (const [at, kind] of [[REAR, b.rear], [FRONT, b.front]] as const) {
      const w = wheel(kind, TYRES, RIMS, GLOW);
      w.position.copy(at);
      g.add(w);
      this.wheels.push(w);
    }

    // TT frame: deep, narrow tubes; low head tube, dropped seat stays
    const headTop = v(0, 0.79, 0.41), headLow = v(0, 0.62, 0.45), seatTop = v(0, 0.8, -0.13), saddle = v(0, 0.96, -0.14);
    g.add(
      place(tube(FRAME, 0.018, 0.045), BB, seatTop),
      place(tube(FRAME, 0.016, 0.03), seatTop, headTop),
      place(tube(FRAME, 0.02, 0.045), BB, headLow),
      place(tube(TRIM, 0.022, 0.05), headLow, headTop),
      place(tube(FRAME, 0.015, 0.03), seatTop, saddle),
      box([0.1, 0.035, 0.25], PARTS, saddle.clone().setY(0.975)),
    );
    for (const x of [-0.05, 0.05]) {
      g.add(
        place(tube(FRAME, 0.011, 0.016), BB.clone().setX(x * 0.6), REAR.clone().setX(x)),
        place(tube(FRAME, 0.01, 0.018), v(x * 0.6, 0.6, -0.16), REAR.clone().setX(x)),
        place(tube(FRAME, 0.01, 0.03), headLow.clone().setX(x * 0.8), FRONT.clone().setX(x)),
      );
    }
    // aero bars: base bar with bull-horn ends, pads on risers, extensions with an upturned tip
    const bar = v(0, 0.86, 0.47);
    g.add(place(tube(PARTS, 0.016, 0.03), headTop, bar), place(tube(PARTS, 0.014), v(-0.19, 0.86, 0.47), v(0.19, 0.86, 0.47)));
    for (const x of [-1, 1]) {
      g.add(
        place(tube(PARTS, 0.013), v(0.19 * x, 0.86, 0.47), v(0.21 * x, 0.8, 0.58)),
        place(tube(PARTS, 0.012), v(0.09 * x, 0.86, 0.44), v(0.09 * x, 0.93, 0.43)),
        box([0.075, 0.025, 0.12], PARTS, v(0.09 * x, 0.945, 0.43)),
        place(tube(PARTS, 0.011), v(0.055 * x, 0.94, 0.42), v(0.05 * x, 0.97, 0.68)),
        place(tube(PARTS, 0.011), v(0.05 * x, 0.97, 0.68), v(0.05 * x, 1.01, 0.74)),
      );
    }
    // cranks + chainring
    for (const x of [-0.075, 0.075]) {
      const arm = tube(PARTS, 0.012, 0.018); g.add(arm); this.crankArms.push(arm); arm.userData.x = x;
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 4, 32), PARTS);
    ring.rotation.y = Math.PI / 2;
    ring.position.copy(BB).setX(-0.06); // drive side = rider's right (-x)
    g.add(ring);

    // rider in aero tuck: flat back, forearms on the pads, hands on the extensions, head low
    const pivot = new THREE.Group();
    pivot.position.set(0, 1, 0); // roll axis level with the pads, so the arms stay on the bars
    this.body.position.set(0, -1, 0);
    pivot.add(this.body);
    g.add(pivot);
    const back = new THREE.Vector3().subVectors(SHOULDER, HIP);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, back.length() - 0.1, 3, 10), SUIT);
    torso.position.addVectors(HIP, SHOULDER).multiplyScalar(0.5);
    torso.quaternion.setFromUnitVectors(UP, back.clone().normalize());
    torso.scale.set(1.15, 1, 0.8);
    torso.castShadow = true;
    const n = v(0, back.z, -back.y).normalize().multiplyScalar(0.115); // across the back, upwards
    this.body.add(
      torso,
      ball(0.15, SUIT, HIP.clone().add(v(0, 0, -0.01)), [1.05, 0.75, 1]),
      place(tube(ACCENT, 0.035, 0.008), HIP.clone().add(n), SHOULDER.clone().add(n)),
      ball(0.095, SKIN, v(0, 1.21, 0.5)),
      ball(0.125, HELMET, v(0, 1.25, 0.45), [1, 0.82, 1.15]),
      ball(0.1, VISOR, v(0, 1.22, 0.585), [1.05, 0.5, 0.6]),
    );
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 8), HELMET); // aero tail along the back
    tail.position.set(0, 1.29, 0.26);
    tail.quaternion.setFromUnitVectors(UP, v(0, -0.03, -0.2).normalize());
    tail.scale.set(1, 1, 0.55);
    tail.castShadow = true;
    this.body.add(tail);
    for (const x of [-1, 1]) {
      const sh = v(0.165 * x, 1.14, 0.37), el = v(0.09 * x, 0.975, 0.43), hand = v(0.055 * x, 1.0, 0.7);
      this.body.add(
        ball(0.06, SUIT, sh),
        place(tube(SUIT, 0.048), sh, el),
        place(tube(SKIN, 0.038), el, hand),
        ball(0.036, SKIN, hand),
      );
    }
    for (const x of [-0.1, 0.1]) {
      const thigh = tube(SUIT, 0.07), shin = tube(SKIN, 0.048), knee = ball(0.052, SKIN, v(0, 0, 0));
      const foot = box([0.07, 0.05, 0.2], SHOES, v(0, 0, 0));
      g.add(thigh, knee, shin, foot);
      this.legs.push({ thigh, knee, shin, foot, x });
    }
    this.update(0, 0, 0, 0);
  }

  update(dt: number, cadence: number, speed: number, effort: number) {
    this.t += dt;
    this.crank += (cadence / 60) * Math.PI * 2 * dt;
    for (const w of this.wheels) w.rotation.x += (speed / WHEEL_R) * dt;
    this.legs.forEach((leg, i) => {
      const a = this.crank + i * Math.PI;
      const pedal = new THREE.Vector3(leg.x, BB.y + Math.sin(a) * CRANK, BB.z + Math.cos(a) * CRANK);
      const arm = this.crankArms[i];
      place(arm, BB.clone().setX(arm.userData.x), pedal.clone().setX(arm.userData.x));
      // 2-bone IK in the y/z plane, knee forward
      const hip = HIP.clone().setX(leg.x);
      const dy = pedal.y - hip.y, dz = pedal.z - hip.z;
      const d = Math.min(Math.hypot(dy, dz), THIGH + SHIN - 1e-3);
      const theta = Math.atan2(dy, dz);
      const alpha = Math.acos((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d));
      const knee = new THREE.Vector3(leg.x, hip.y + Math.sin(theta + alpha) * THIGH, hip.z + Math.cos(theta + alpha) * THIGH);
      place(leg.thigh, hip, knee);
      place(leg.shin, knee, pedal);
      leg.knee.position.copy(knee);
      leg.foot.position.set(leg.x, pedal.y + 0.02, pedal.z + 0.04);
    });
    // roll a little with each pedal stroke, more under load
    const load = Math.min(1.5, effort);
    this.body.parent!.rotation.z = Math.sin(this.crank) * 0.025 * load * (cadence > 0 ? 1 : 0);
    this.body.position.y = -1 + (cadence > 0 ? 0 : Math.sin(this.t * 1.5) * 0.004);
  }
}
