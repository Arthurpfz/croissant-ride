import * as THREE from 'three';
import type { Route } from '../route';
import { beside } from '../kit';
import { fbm } from '../noise';

// banks of cleared snow along both edges from `from` m to the end of the road, `height` [min, max] m tall: a steep
// ploughed face on the road side, a lumpy top, a slope down on the outside; bluish where the face is in shade
export default function snowbanks(p: { from: number; height: [number, number]; color: string }, route: Route) {
  const STEP = 2, rows = Math.floor((route.length - 20 - p.from) / STEP);
  const white = new THREE.Color(p.color), shade = white.clone().lerp(new THREE.Color('#9fb3c8'), 0.35);
  const group = new THREE.Group();
  for (const s of [1, -1]) {
    const v: number[] = [], col: number[] = [], idx: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const d = p.from + i * STEP, n = fbm(d / 23 + s * 7, s * 3), h = p.height[0] + (p.height[1] - p.height[0]) * n;
      const fade = Math.min(1, i / 10, (rows - i) / 10); // ramps up from and down to the road at each end
      // [offset from the road centre, height]: foot, face top, crown, outer foot
      for (const [o, y, c] of [[4.5, -0.6, shade], [4.6, h * fade, shade], [5.4, (h + 0.25) * fade, white], [7.5, -1.5, white]] as const) {
        const at = beside(route, d, s * o);
        v.push(at.x, at.y + y, at.z);
        col.push(c.r, c.g, c.b);
      }
      if (i < rows) for (let k = 0; k < 3; k++) {
        const a = i * 4 + k, b = a + 4;
        if (s > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const bank = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    bank.receiveShadow = true;
    group.add(bank);
  }
  return group;
}
