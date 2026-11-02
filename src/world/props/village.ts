import * as THREE from 'three';
import type { Route } from '../route';
import { beside, texture, type Ground, type Rand } from '../kit';

// Alpine chalets (stone base, wooden upper floor, grey roof) in clusters [m along the road, radius, count]; the first
// cluster gets a church tower and a boulangerie with a lit window and a croissant on its sign
export default function village(p: { clusters: [number, number, number][]; wall: string; wood: string; roof: string; tower: string; bakery: string }, route: Route, ground: Ground, rand: Rand) {
  const group = new THREE.Group();
  if (!ground) return group;
  const total = p.clusters.reduce((a, [, , n]) => a + n, 0);
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const prism = new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2).translate(0, 0.5, 0); // ridge along z, apex up
  const walls = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: p.wall, flatShading: true }), total);
  const wood = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: p.wood, flatShading: true }), total);
  const roofs = new THREE.InstancedMesh(prism, new THREE.MeshLambertMaterial({ color: p.roof, flatShading: true }), total);
  for (const m of [walls, wood, roofs]) { m.castShadow = true; m.receiveShadow = true; }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const slope = (x: number, z: number) => Math.hypot(ground(x + 4, z) - ground(x - 4, z), ground(x, z + 4) - ground(x, z - 4)) / 8;
  let n = 0, bakery: { x: number; y: number; z: number; yaw: number; w: number; d: number } | undefined;

  p.clusters.forEach(([at, radius, count], c) => {
    const centre = beside(route, at, 0);
    for (let k = 0, tries = 0; k < count && tries < count * 30; tries++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
      const x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r;
      const near = route.nearRoad(x, z);
      if (near.dist < 11 || slope(x, z) > 0.35) continue;
      const w = 7 + rand() * 5, d = 8 + rand() * 6, base = 3 + rand() * 2, upper = 2.5 + rand() * 1.5, y = ground(x, z) - 2;
      const yaw = beside(route, at, 0).yaw + (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.3; // roughly square to the road
      q.setFromAxisAngle(Y, yaw);
      walls.setMatrixAt(n, m4.compose(v.set(x, y, z), q, s.set(w, base + 2, d)));
      wood.setMatrixAt(n, m4.compose(v.set(x, y + base + 2, z), q, s.set(w * 0.98, upper, d * 0.98)));
      roofs.setMatrixAt(n, m4.compose(v.set(x, y + base + 2 + upper - 0.75 * (2.4 + rand()), z), q, s.set((w + 1.6) / 1.732, 2.4 + rand(), d + 1.6))); // overhanging eaves
      if (c === 0 && !bakery && near.dist < 30) bakery = { x, y: y + 2, z, yaw, w, d };
      n++; k++;
    }
  });
  walls.count = wood.count = roofs.count = n;
  group.add(walls, wood, roofs);

  // church: stone tower with a slate spire, beside the road in the first cluster
  const ch = beside(route, p.clusters[0][0] + 120, -26);
  const tower = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: p.tower, flatShading: true }));
  tower.scale.set(5, 22, 5);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3.6, 10, 4).rotateY(Math.PI / 4).translate(0, 5, 0), roofs.material);
  spire.position.y = 22;
  const church = new THREE.Group().add(tower, spire);
  church.position.set(ch.x, ground(ch.x, ch.z) - 2, ch.z);
  church.rotation.y = ch.yaw;
  group.add(church);

  // boulangerie: a warm window and a hanging sign on the road side of the nearest chalet
  if (bakery) {
    const b = new THREE.Group();
    b.position.set(bakery.x, bakery.y, bakery.z);
    b.rotation.y = bakery.yaw;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.bakery).multiplyScalar(1.4) }));
    for (const side of [1, -1]) { // both long faces, so the window shows whichever way the chalet turned
      const win = glow.clone();
      win.position.set(0, 1.6, (side * bakery.d) / 2 + side * 0.02);
      win.rotation.y = side > 0 ? 0 : Math.PI;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshLambertMaterial({ map: texture(croissantSign()), side: THREE.DoubleSide }));
      sign.position.set(bakery.w / 2 - 1, 3.4, side * (bakery.d / 2 + 0.9));
      sign.rotation.y = Math.PI / 2;
      b.add(win, sign);
    }
    group.add(b);
  }
  return group;
}

// "BOULANGERIE" with a croissant
export function croissantSign(text = 'BOULANGERIE') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#2b2c30'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#ecebe6'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 120);
  croissant(g, 128, 48, 40);
  g.fillStyle = '#ecebe6'; g.font = '700 22px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText(text, 128, 112);
  return cv;
}

// a crescent in crust (thick in the middle, pointed horns: two half-ellipses of the same width) with darker rolls across it
export function croissant(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const y0 = cy + r * 0.45, w = r * 1.15;
  g.fillStyle = '#e8783a';
  g.beginPath();
  g.ellipse(cx, y0, w, r * 0.85, 0, Math.PI, 0);
  g.ellipse(cx, y0, w, r * 0.3, 0, 0, Math.PI, true);
  g.fill();
  g.strokeStyle = '#b4521d'; g.lineWidth = r * 0.08; g.lineCap = 'round';
  for (const t of [-0.6, -0.22, 0.22, 0.6]) {
    const a = Math.PI * (1.5 + t * 0.55), c = Math.cos(a), s = Math.sin(a);
    g.beginPath();
    g.moveTo(cx + c * w * 0.97, y0 + s * r * 0.31);
    g.quadraticCurveTo(cx + c * w + t * r * 0.25, y0 + s * r * 0.55, cx + c * w * 0.99, y0 + s * r * 0.82);
    g.stroke();
  }
}
