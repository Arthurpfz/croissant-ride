import * as THREE from 'three';
import type { Route } from '../route';
import { sceneryOf } from '../packs';
import { texture, type Ground, type Rand } from '../kit';

// The route's real buildings (footprint, heading and height from its scenery) as Alpine chalets: stone below, wood
// above, a grey roof with its ridge along the long side. Churches and chapels get a tower with a spire; the house
// nearest the road in the first 600 m is the boulangerie, with a lit window and a croissant on its sign
export default function village(p: { wall: string[]; wood: string[]; roof: string[]; glass: string; tower: string; bakery: string }, route: Route, ground: Ground, rand: Rand) {
  const group = new THREE.Group(), all = sceneryOf(route.data)?.buildings;
  if (!ground || !all) return group;
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const prism = new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2).translate(0, 0.5, 0); // ridge along z, apex 1.5 up, 1.732 wide
  const roofs = new THREE.InstancedMesh(prism, new THREE.MeshLambertMaterial({ flatShading: true }), all.length);
  const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const pick = (list: string[]) => c.set(list[Math.floor(rand() * list.length)]).multiplyScalar(0.9 + rand() * 0.2);
  const towerMat = new THREE.MeshLambertMaterial({ color: p.tower, flatShading: true }), spireMat = new THREE.MeshLambertMaterial({ color: p.roof[0], flatShading: true });
  // all the walls are one mesh: a quad per side and storey band, tinted per house, each tile of the texture one window
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const start = route.samples[0];
  let n = 0, bakery: { x: number; y: number; z: number; yaw: number; w: number; d: number; dist: number } | undefined;

  for (const [x, z, w, d, deg, h, church] of all) {
    const yaw = (deg * Math.PI) / 180, cos = Math.cos(yaw), sin = Math.sin(yaw);
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [x + (a * w * cos + b * d * sin) / 2, z + (b * d * cos - a * w * sin) / 2]);
    const near = route.nearRoad(x, z).dist;
    if (corners.some(([cx, cz]) => route.nearRoad(cx, cz).dist < 4.5) || near < 4.5) continue; // the road's own cutting wins
    // on a slope the walls start at the lowest corner
    const y = Math.min(ground(x, z), ...corners.map(([cx, cz]) => ground(cx, cz))) - 0.5;
    const top = Math.max(ground(x, z) + h, y + 3), stone = (top - y) * (h > 9 ? 0.3 : 0.5), rise = Math.min(4.5, Math.max(1.2, w * 0.28));
    for (const [y0, y1, tint] of [[y, y + stone, pick(p.wall).clone()], [y + stone, top, pick(church ? p.wall : p.wood).clone()]] as const) {
      corners.forEach(([ax, az], k) => {
        const [bx, bz] = corners[(k + 1) % 4], across = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 3.4)), up = Math.max(1, Math.round((y1 - y0) / 2.8)), i = pos.length / 3;
        pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
        uv.push(0, 0, across, 0, across, up, 0, up);
        for (let j = 0; j < 4; j++) col.push(tint.r, tint.g, tint.b);
        idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
      });
    }
    q.setFromAxisAngle(Y, yaw);
    roofs.setMatrixAt(n, m4.compose(v.set(x, top - rise * 0.2, z), q, s.set((1.2 * (w + 1)) / 1.732, rise * 0.8, d + 1.4))); // eaves hang over the walls
    roofs.setColorAt(n++, pick(p.roof));
    if (church) { // bell tower at one end of the nave
      const side = Math.min(w * 0.6, 5), tall = Math.max(h * 1.9, 9);
      const tower = new THREE.Mesh(box, towerMat), spire = new THREE.Mesh(new THREE.ConeGeometry(side * 0.72, tall * 0.45, 4).rotateY(Math.PI / 4).translate(0, tall * 0.225, 0), spireMat);
      tower.scale.set(side, tall, side);
      spire.position.y = tall;
      const t = new THREE.Group().add(tower, spire);
      t.position.set(x + (sin * d) / 2, y, z + (cos * d) / 2);
      t.rotation.y = yaw;
      tower.castShadow = spire.castShadow = true;
      group.add(t);
    }
    const out = Math.hypot(x - start.x, z - start.z);
    if (!church && near < (bakery?.dist ?? 40) && out > 150 && out < 600) bakery = { x, y: ground(x, z), z, yaw, w, d, dist: near };
  }
  roofs.count = n;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const walls = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texture(windowTile(p.glass)), vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  for (const m of [walls, roofs]) { m.castShadow = true; m.receiveShadow = true; }
  group.add(walls, roofs);

  // boulangerie: a warm window and a hanging sign on both long faces
  if (bakery) {
    const b = new THREE.Group();
    b.position.set(bakery.x, bakery.y, bakery.z);
    b.rotation.y = bakery.yaw;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.bakery).multiplyScalar(1.4) }));
    for (const side of [1, -1]) { // both faces, so the window shows whichever way the house stands to the road
      const win = glow.clone();
      win.position.set((side * bakery.w) / 2 + side * 0.02, 1.6, 0);
      win.rotation.y = (side * Math.PI) / 2;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshLambertMaterial({ map: texture(croissantSign()), side: THREE.DoubleSide }));
      sign.position.set(side * (bakery.w / 2 + 0.9), 3.4, bakery.d / 2 - 1);
      b.add(win, sign);
    }
    group.add(b);
  }
  return group;
}

// one wall tile (white, to take the house's tint): a window with a pale frame and a sill
function windowTile(glass: string) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e9e4da'; g.fillRect(20, 16, 24, 30);
  g.fillStyle = glass; g.fillRect(22, 18, 9, 26); g.fillRect(33, 18, 9, 26);
  g.fillStyle = '#8f8a82'; g.fillRect(18, 46, 28, 3);
  return cv;
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
