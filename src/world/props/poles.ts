import * as THREE from 'three';
import type { Route } from '../route';
import { beside } from '../kit';

// two-tone snow poles on both road edges every `every` m, where the road is above `above` m
export default function poles(p: { every: number; above: number; colors: [string, string] }, route: Route) {
  const geo = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 5).translate(0, 1.3, 0);
  const pos = geo.attributes.position, cols: number[] = [], [top, low] = p.colors.map((c) => new THREE.Color(c));
  for (let i = 0; i < pos.count; i++) { const c = pos.getY(i) > 1.9 ? top : low; cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const spots: THREE.Vector3[] = [];
  for (let d = p.every / 2; d < route.length; d += p.every) {
    if (route.elevAt(d) < p.above) continue;
    for (const s of [1, -1]) { const at = beside(route, d + (s > 0 ? 0 : p.every / 2), s * 4.3); spots.push(new THREE.Vector3(at.x, at.y - 0.9, at.z)); }
  }
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach((v, i) => mesh.setMatrixAt(i, m4.makeTranslation(v.x, v.y, v.z)));
  return mesh;
}
